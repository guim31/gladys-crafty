// -----------------------------------------------------------------------------
// The Crafty hub: reads the server list and the statistics of every server on
// a timer of the container (the interval chosen in the configuration),
// publishes the states to Gladys when they change (and every few hours, the
// heartbeat), fires the scene events on transitions (a player joined or left,
// the server emptied or filled up, stopped unexpectedly, restarted), and runs
// the commands of the scene actions and of the widget.
//
// Gladys never polls these devices (should_poll: false): Gladys 5.2 does not
// poll an external device reliably (GladysAssistant/Gladys#3198), and the
// scene events must fire even for a server whose device was not added. Every
// server is read; the states only go to the devices added to Gladys (it drops
// the others and they count in its 300 states a minute).
// (Structure from guim31/gladys-gamedig and guim31/gladys-semaphore.)
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { ACTIONS, CraftyClient, CraftyError, ERROR_KINDS } from './crafty/client.js';
import { FEATURE_KEYS, buildDevice, deviceIds, featureStates, playersText } from './devices.js';
import { ACTION_TEXT, CONNECTION_TEXT, ERROR_TEXT, REPORT_TEXT, labelled, pick } from './texts.js';

const logger = createLogger({ name: 'crafty-hub' });

export const WIDGET_KEY = 'crafty_servers';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  PLAYER_JOINED: 'player_joined',
  PLAYER_LEFT: 'player_left',
  SERVER_EMPTY: 'server_empty',
  SERVER_FULL: 'server_full',
  SERVER_CRASHED: 'server_crashed',
  SERVER_RESTARTED: 'server_restarted',
});

export const HUB_TIMINGS = {
  // An unchanged value is sent again this often, so Gladys never shows it as
  // stale ("no recent value" after 48 h).
  heartbeatMs: 6 * 60 * 60_000,
  // After a command, Crafty is read again this soon: it records the
  // statistics every 30 s.
  followUpMs: 35_000,
  // A stop asked from Gladys (stop, restart) is expected for this long: the
  // server going down then is no crash.
  expectStopMs: 5 * 60_000,
  // A restart asked from Gladys is reported when the server runs again
  // within this time.
  restartWindowMs: 10 * 60_000,
  // A clean stop not asked from Gladys followed by a start within this time
  // is a restart from Crafty (its restart takes a few seconds).
  cleanRestartWindowMs: 2 * 60_000,
};

// Joins or leaves fired for one reading at most: a server restarting with
// 64 players in it must not flood the scenes (300 events a minute).
export const MAX_EVENTS_PER_READING = 10;

export class CraftyHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {Function} [options.request] the network seam of the client (tests)
   * @param {boolean} [options.timers] periodic timers (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, request, timers = true, timings, now }) {
    this.gladys = gladys;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.config = null;
    /** @type {CraftyClient|null} */
    this.client = null;
    /** @type {Map<string, object>} server records, by Crafty server id */
    this.records = new Map();
    /** The last failure to read Crafty: { kind, message }, null when it answers. */
    this.error = null;
    /** Crafty has answered once since the configuration. */
    this.answered = false;
    this.transports = new Map();
    this.connection = null;
    this.published = null;
    this.pollTimer = null;
    this.followUpTimer = null;
    this.polling = null;
    this.stopped = false;
    /** Problems already logged, by key: repeats go to debug. */
    this.warned = new Set();
  }

  // --- Logs ------------------------------------------------------------------
  // Info keeps the lifecycle only (Crafty connected, lost, back; servers
  // appearing; one line per command). A problem that repeats every cycle is
  // logged once, then at debug until it clears. LOG_LEVEL=debug shows all.

  /** Log a problem once (`level` warn or error), its repeats at debug. */
  problem(key, message, err, level = 'warn') {
    const args = err === undefined ? [message] : [message, err];
    if (this.warned.has(key)) {
      logger.debug(...args);
      return;
    }
    this.warned.add(key);
    logger[level](...args);
  }

  /** The problem `key` is gone: the next occurrence is logged again. */
  resolved(key) {
    this.warned.delete(key);
  }

  get language() {
    return this.config?.language ?? 'fr';
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates();
    this.transports.clear();
    this.connection = null;
    this.published = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    // A reading under way belongs to the previous configuration (another
    // Crafty, another token): let it end before changing anything, then read
    // afresh.
    await this.polling?.catch(() => {});
    const previous = this.config;
    this.config = config;
    const sameCrafty =
      previous !== null &&
      previous.url === config.url &&
      previous.token === config.token &&
      previous.insecure === config.insecure;
    if (!sameCrafty) {
      // Another Crafty (or token): its servers are a new starting point.
      this.records.clear();
      this.error = null;
      this.answered = false;
      this.client =
        config.url && config.token
          ? new CraftyClient({
              url: config.url,
              token: config.token,
              insecure: config.insecure,
              ...(this.request ? { request: this.request } : {}),
            })
          : null;
    }
    if (previous !== null && previous.language !== config.language) {
      // The players text is worded in the configured language; the feature
      // names of devices not yet added too.
      this.gladys.forgetPublishedStates();
      this.published = null;
    }
    // The timer starts whatever happens: a refused discovery must not stop
    // the readings, the scene events and the widget.
    try {
      await this.pollAll();
    } finally {
      this.schedulePoll();
    }
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    clearTimeout(this.followUpTimer);
  }

  schedulePoll() {
    clearTimeout(this.pollTimer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.pollTimer = setTimeout(async () => {
      try {
        await this.pollAll();
        this.resolved('poll');
      } catch (err) {
        this.problem('poll', 'Reading cycle failed', err, 'error');
      }
      this.schedulePoll();
    }, this.config.pollIntervalMs);
  }

  /** Read Crafty again soon after a command, when its statistics have moved. */
  scheduleFollowUp() {
    clearTimeout(this.followUpTimer);
    if (!this.timersEnabled || this.stopped) {
      return;
    }
    this.followUpTimer = setTimeout(() => {
      this.pollAll().catch((err) => this.problem('poll', 'Reading cycle failed', err, 'error'));
    }, this.timings.followUpMs);
    this.followUpTimer.unref?.();
  }

  // --- Devices -----------------------------------------------------------------

  async publishDevices() {
    const devices = [...this.records.values()].map((record) =>
      buildDevice(this.gladys, record.server, record.seen, this.language),
    );
    // Sent again only when something changed: a new server, a renamed one,
    // a version seen for the first time, another language.
    const key = JSON.stringify(devices);
    if (key === this.published) {
      return;
    }
    // Even an empty list: the Discovery tab then shows no stale server.
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.published = key;
      this.resolved('discovery');
    } catch (err) {
      this.problem('discovery', `Devices refused by Gladys: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab: read Crafty, publish the devices again. */
  async rediscover() {
    this.published = null;
    await this.pollAll();
  }

  /** The device external ids the user added to Gladys. */
  createdDevices() {
    return new Set((this.gladys.devices ?? []).map((device) => device.external_id));
  }

  recordOf(externalId) {
    for (const record of this.records.values()) {
      if (deviceIds(this.gladys, record.server.id).device === externalId) {
        return record;
      }
    }
    return null;
  }

  /** The user added (or updated) a device: the SDK forgot its states, send them again now. */
  async onDeviceCreated(device) {
    const record = this.recordOf(device.external_id);
    if (!record) {
      return;
    }
    await this.publishStates(record, { created: true });
    this.transports.delete(device.external_id);
    await this.publishTransports();
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  newRecord(server) {
    return {
      server,
      stats: null,
      /** The statistics could not be read for this server: { kind }. */
      error: null,
      /** The optional features (slots, version) the server has given. */
      seen: new Set(),
      /** The last complete list of names (a Set), null when unknown. */
      names: null,
      /** When each player was seen joining. */
      joinedAt: new Map(),
      /** A stop asked from Gladys is expected until then. */
      expectStopUntil: 0,
      /** The next start is reported as a restart: 'crash' | 'requested' | null. */
      pendingRestart: null,
      pendingRestartUntil: 0,
    };
  }

  // --- Reading Crafty ------------------------------------------------------------

  /** Read Crafty (the list, then every server). Concurrent calls share the read. */
  pollAll() {
    this.polling ??= this.readAll().finally(() => {
      this.polling = null;
    });
    return this.polling;
  }

  /** Gladys asks for a refresh (onPoll, a fallback): read Crafty now. */
  async pollDevice(device) {
    if (this.recordOf(device.external_id)) {
      await this.pollAll();
    }
  }

  async readAll() {
    if (!this.client) {
      await this.publishDevices();
      await this.publishConnectionStatus();
      return;
    }
    let servers;
    try {
      servers = await this.client.listServers();
    } catch (err) {
      if (!(err instanceof CraftyError)) {
        throw err;
      }
      await this.applyFailure(err);
      return;
    }
    const wasError = this.error;
    this.error = null;
    if (wasError) {
      logger.info('Crafty answers again');
    } else if (!this.answered) {
      logger.info(`Connected to Crafty: ${servers.length} server(s)`);
    }
    this.answered = true;

    let widget = Boolean(wasError);
    const ids = new Set(servers.map((server) => server.id));
    for (const id of this.records.keys()) {
      if (!ids.has(id)) {
        logger.info(`Server ${this.records.get(id).server.name} is no longer in Crafty`);
        this.records.delete(id);
        widget = true;
      }
    }
    for (const server of servers) {
      const record = this.records.get(server.id);
      if (record) {
        widget ||= record.server.name !== server.name;
        record.server = server;
      } else {
        this.records.set(server.id, this.newRecord(server));
        widget = true;
      }
    }

    const results = await Promise.all(
      [...this.records.values()].map((record) => this.readServer(record)),
    );
    widget ||= results.some(Boolean);
    await this.publishDevices();
    for (const record of this.records.values()) {
      await this.publishStates(record);
    }
    await this.afterChanges(widget);
  }

  /** Read the statistics of one server and apply them; true when the widget changed. */
  async readServer(record) {
    let stats;
    try {
      stats = await this.client.stats(record.server.id);
    } catch (err) {
      if (!(err instanceof CraftyError)) {
        throw err;
      }
      const changed = record.error?.kind !== err.kind;
      record.error = { kind: err.kind };
      this.problem(`stats-${record.server.id}`, `${record.server.name}: ${err.message}`);
      return changed;
    }
    if (record.error) {
      record.error = null;
      this.resolved(`stats-${record.server.id}`);
      logger.info(`${record.server.name}: statistics readable again`);
    }
    return this.applyStats(record, stats);
  }

  async applyFailure(err) {
    const wasKind = this.error?.kind;
    this.error = { kind: err.kind, message: err.message };
    // One warning when the problem starts (or changes), not one per reading.
    if (wasKind !== err.kind) {
      logger.warn(`Crafty: ${err.message}`);
    } else {
      logger.debug(`Crafty: ${err.message} (again)`);
    }
    await this.afterChanges(wasKind !== err.kind);
  }

  /**
   * Apply a reading of a server: version seen, scene events on transitions.
   * The first reading is a starting point: no event.
   * @returns {Promise<boolean>} the widget changed
   */
  async applyStats(record, stats) {
    const previous = record.stats;
    record.stats = stats;
    if (stats.version) {
      record.seen.add(FEATURE_KEYS.VERSION);
    }
    if (stats.max > 0) {
      record.seen.add(FEATURE_KEYS.PLAYERS_MAX);
    }
    if (previous === null) {
      this.resetPlayers(record, stats);
      return true;
    }
    const now = this.now();
    const restarted =
      previous.running &&
      stats.running &&
      previous.started &&
      stats.started &&
      previous.started !== stats.started;
    if (previous.running && !stats.running) {
      await this.onStopped(record, stats, now);
    } else if (!previous.running && stats.running) {
      await this.onStarted(record, now);
    } else if (restarted) {
      // Stopped and started again between two readings.
      if (stats.crashed && !previous.crashed && now >= record.expectStopUntil) {
        record.pendingRestart = 'crash';
        await this.fire(TRIGGERS.SERVER_CRASHED, record, {});
      }
      record.pendingRestart ??= 'requested';
      record.pendingRestartUntil = now + this.timings.restartWindowMs;
      await this.onStarted(record, now);
    }
    // After a restart, who is playing starts again from scratch.
    if (!restarted && previous.running && stats.running && previous.answering && stats.answering) {
      await this.playerTransitions(record, previous, stats);
    } else {
      this.resetPlayers(record, stats);
    }
    return (
      previous.running !== stats.running ||
      previous.answering !== stats.answering ||
      previous.online !== stats.online ||
      previous.max !== stats.max ||
      previous.version !== stats.version ||
      previous.started !== stats.started ||
      Math.round(previous.cpu) !== Math.round(stats.cpu) ||
      (previous.players ?? []).join() !== (stats.players ?? []).join()
    );
  }

  async onStopped(record, stats, now) {
    const name = record.server.name;
    if (now < record.expectStopUntil) {
      // The stop asked from Gladys: it explains this stop, not the next one
      // (a crash a minute after a start from Gladys is still a crash).
      record.expectStopUntil = 0;
      logger.info(`${name} stopped`);
      return;
    }
    // Not asked from Gladys: Crafty's crash flag (crash detection on), else
    // its log file, which says "Stopping server" on any clean shutdown (the
    // Stop button of Crafty, a /stop in the console). Unreadable log: unknown.
    let clean;
    try {
      clean = await this.client.stoppedCleanly(record.server.id);
    } catch {
      clean = null;
    }
    if (stats.crashed || clean === false) {
      logger.warn(`${name} stopped unexpectedly`);
      record.pendingRestart = 'crash';
      record.pendingRestartUntil = Infinity;
      await this.fire(TRIGGERS.SERVER_CRASHED, record, {});
      return;
    }
    // A clean stop from Crafty: if the server runs again soon, it was the
    // Restart button of Crafty (a reading fell between the stop and the start).
    record.pendingRestart = 'requested';
    record.pendingRestartUntil = now + this.timings.cleanRestartWindowMs;
    logger.info(`${name} stopped`);
  }

  async onStarted(record, now) {
    const pending = record.pendingRestart;
    const inTime = now <= record.pendingRestartUntil;
    record.pendingRestart = null;
    record.pendingRestartUntil = 0;
    // A restart asked from Gladys is over: its stop is no longer expected.
    record.expectStopUntil = 0;
    logger.info(`${record.server.name} started`);
    if (pending && inTime) {
      await this.fire(TRIGGERS.SERVER_RESTARTED, record, { after_crash: pending === 'crash' });
    }
  }

  /** A new starting point for the players: no event. */
  resetPlayers(record, stats) {
    record.names = stats.running && stats.namesComplete ? new Set(stats.players) : null;
    if (!record.names) {
      record.joinedAt.clear();
      return;
    }
    for (const name of [...record.joinedAt.keys()]) {
      if (!record.names.has(name)) {
        record.joinedAt.delete(name);
      }
    }
  }

  /**
   * Joins and leaves, emptied and full, between two readings of a running
   * server. By name when both readings name every player, else by count
   * (the event then has no player name).
   */
  async playerTransitions(record, previous, stats) {
    if (!record.server.countsPlayers) {
      return;
    }
    const beforeNames = record.names;
    record.names = stats.namesComplete ? new Set(stats.players) : null;
    const now = this.now();
    if (!stats.namesComplete) {
      record.joinedAt.clear();
    }
    const base = { players_online: stats.online, players_max: stats.max };
    if (beforeNames && stats.namesComplete) {
      const joined = stats.players.filter((name) => !beforeNames.has(name));
      const left = [...beforeNames].filter((name) => !record.names.has(name));
      for (const name of joined.slice(0, MAX_EVENTS_PER_READING)) {
        record.joinedAt.set(name, now);
        logger.debug(`${record.server.name}: ${name} joined`);
        await this.fire(TRIGGERS.PLAYER_JOINED, record, { ...base, player: name });
      }
      for (const name of left.slice(0, MAX_EVENTS_PER_READING)) {
        const since = record.joinedAt.get(name);
        record.joinedAt.delete(name);
        logger.debug(`${record.server.name}: ${name} left`);
        await this.fire(TRIGGERS.PLAYER_LEFT, record, {
          ...base,
          player: name,
          minutes_played: since === undefined ? null : Math.round((now - since) / 60_000),
        });
      }
    } else {
      const delta = stats.online - previous.online;
      const key = delta > 0 ? TRIGGERS.PLAYER_JOINED : TRIGGERS.PLAYER_LEFT;
      for (let i = 0; i < Math.min(Math.abs(delta), MAX_EVENTS_PER_READING); i += 1) {
        await this.fire(
          key,
          record,
          delta > 0 ? { ...base, player: '' } : { ...base, player: '', minutes_played: null },
        );
      }
    }
    if (previous.online > 0 && stats.online === 0) {
      await this.fire(TRIGGERS.SERVER_EMPTY, record, { players_max: stats.max });
    }
    if (stats.max > 0 && stats.online >= stats.max && previous.online < stats.max) {
      await this.fire(TRIGGERS.SERVER_FULL, record, base);
    }
  }

  async fire(key, record, data) {
    try {
      await this.gladys.publishSceneEvent(key, {
        device: deviceIds(this.gladys, record.server.id).device,
        server: record.server.name,
        ...data,
      });
      this.resolved('scene-event');
    } catch (err) {
      this.problem('scene-event', `Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Publishing to Gladys ----------------------------------------------------------

  /**
   * The states of a server, to its device if the user added it. Only the
   * changes, and every value once per heartbeat (SDK publishChangedStates).
   */
  async publishStates(record, { created = false } = {}) {
    const externalId = deviceIds(this.gladys, record.server.id).device;
    if (!created && !this.createdDevices().has(externalId)) {
      return;
    }
    // Statistics unreadable: no state, not even the heartbeat — Gladys then
    // shows the values as old, which they are.
    if (record.error) {
      return;
    }
    const states = featureStates(this.gladys, record, this.language)
      .filter((entry) => entry.state !== undefined || entry.text !== undefined)
      .map(({ externalId: id, state, text }) =>
        text === undefined
          ? { device_feature_external_id: id, state }
          : { device_feature_external_id: id, text },
      );
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeatMs });
      this.resolved('states');
    } catch (err) {
      this.problem('states', `States of ${record.server.name} refused: ${err.message}`);
    }
  }

  /** The periodic tail of a reading: transports, connection status, widget. */
  async afterChanges(widgetChanged) {
    await this.publishTransports();
    await this.publishConnectionStatus();
    if (widgetChanged) {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  async publishTransports() {
    const transport = this.error ? DEVICE_TRANSPORTS.UNREACHABLE : DEVICE_TRANSPORTS.LOCAL;
    const entries = [];
    for (const record of this.records.values()) {
      const externalId = deviceIds(this.gladys, record.server.id).device;
      if (this.transports.get(externalId) !== transport) {
        entries.push({ external_id: externalId, transport });
      }
    }
    if (entries.length === 0) {
      return;
    }
    try {
      await this.gladys.publishTransports(entries);
      for (const entry of entries) {
        this.transports.set(entry.external_id, entry.transport);
      }
      this.resolved('transports');
    } catch (err) {
      this.problem('transports', `Transports refused: ${err.message}`);
    }
  }

  /** The status under the integration name. */
  connectionStatus() {
    const config = this.config;
    let text = null;
    if (config.urlInvalid) {
      text = CONNECTION_TEXT.badUrl;
    } else if (!this.client) {
      text = CONNECTION_TEXT.missing;
    } else if (this.error) {
      text = ERROR_TEXT[this.error.kind] ?? ERROR_TEXT[ERROR_KINDS.HTTP];
    } else if (this.answered && this.records.size === 0) {
      text = CONNECTION_TEXT.noServer;
    } else if (!this.answered) {
      return { connected: false };
    }
    if (text === null) {
      return { connected: true };
    }
    return { connected: false, message: { ...text } };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.resolved('connection-status');
    } catch (err) {
      this.problem('connection-status', `Connection status refused: ${err.message}`);
    }
  }

  // --- Commands, scene action and reports ----------------------------------------------

  /** The record of a device (scene field or widget param), or an Error in the user's language. */
  recordForCommand(deviceExternalId, language = this.language) {
    if (!this.client) {
      throw new Error(pick(ACTION_TEXT.noCrafty, language));
    }
    const record = this.recordOf(deviceExternalId);
    if (!record) {
      throw new Error(pick(ACTION_TEXT.unknownServer, language));
    }
    return record;
  }

  /**
   * Start, stop, restart or back up a server. Stop and restart only when the
   * configuration allows them.
   * @returns {Promise<{ sent: boolean, message: object }>} message: multi-language
   */
  async command(deviceExternalId, action, language = this.language) {
    const record = this.recordForCommand(deviceExternalId, language);
    if ((action === ACTIONS.STOP || action === ACTIONS.RESTART) && !this.config.allowStop) {
      throw new Error(pick(ACTION_TEXT.stopDenied, language));
    }
    const running = record.stats?.running;
    if (action === ACTIONS.START && running === true) {
      return { sent: false, message: ACTION_TEXT.alreadyRunning };
    }
    if (action === ACTIONS.STOP && running === false) {
      return { sent: false, message: ACTION_TEXT.alreadyStopped };
    }
    const { id, name } = record.server;
    // Set before sending (Crafty may act before it answers), restored if the
    // command fails: a refused stop must not hide a later crash.
    const before = {
      expectStopUntil: record.expectStopUntil,
      pendingRestart: record.pendingRestart,
      pendingRestartUntil: record.pendingRestartUntil,
    };
    try {
      let backupId = null;
      if (action === ACTIONS.BACKUP) {
        backupId = await this.client.defaultBackupId(id);
        if (!backupId) {
          throw new Error(pick(ACTION_TEXT.noBackup, language));
        }
      }
      if (action === ACTIONS.STOP || action === ACTIONS.RESTART) {
        record.expectStopUntil = this.now() + this.timings.expectStopMs;
      }
      if (action === ACTIONS.RESTART) {
        // A restart after a crash stays "after a crash".
        record.pendingRestart = record.pendingRestart === 'crash' ? 'crash' : 'requested';
        record.pendingRestartUntil = this.now() + this.timings.restartWindowMs;
      }
      await this.client.action(id, action, backupId);
    } catch (err) {
      Object.assign(record, before);
      if (err instanceof CraftyError) {
        logger.warn(`${action} on ${name} refused: ${err.message}`);
        throw new Error(pick(ERROR_TEXT[err.kind] ?? ERROR_TEXT[ERROR_KINDS.HTTP], language), {
          cause: err,
        });
      }
      throw err;
    }
    logger.info(`${action} sent to ${name}`);
    this.scheduleFollowUp();
    return { sent: true, message: ACTION_TEXT[action] };
  }

  /**
   * "Read a server": read Crafty now, and return what a scene message needs.
   * @returns {Promise<object>} the outputs of the scene action
   */
  async readForScene(deviceExternalId) {
    const language = this.language;
    this.recordForCommand(deviceExternalId, language);
    await this.pollAll();
    if (this.error) {
      throw new Error(pick(ERROR_TEXT[this.error.kind], language));
    }
    const record = this.recordForCommand(deviceExternalId, language);
    if (record.error) {
      throw new Error(pick(ERROR_TEXT[record.error.kind], language));
    }
    const stats = record.stats ?? { running: false, online: 0, max: 0, cpu: 0, memoryBytes: 0 };
    return {
      running: stats.running,
      players_online: stats.online,
      players_max: stats.max,
      players: record.stats ? playersText(stats, language) : '',
      cpu: Math.round(stats.cpu),
      memory: Math.round(stats.memoryBytes / (1024 * 1024)),
      version: stats.version ?? '',
      server: record.server.name,
    };
  }

  /** "Test the connection": read Crafty now, one line per server. */
  async testConnection() {
    await this.pollAll();
    const message = {};
    const status = this.connectionStatus();
    for (const [language, words] of Object.entries(REPORT_TEXT)) {
      if (status.message) {
        message[language] = status.message[language];
        continue;
      }
      const lines = [words.servers(this.records.size)];
      for (const record of this.records.values()) {
        if (record.error) {
          lines.push(
            labelled(record.server.name, pick(ERROR_TEXT[record.error.kind], language), language),
          );
          continue;
        }
        const { stats } = record;
        const parts = [stats?.running ? words.running : words.stopped];
        if (stats?.running && record.server.countsPlayers && stats.max > 0) {
          parts.push(words.players(stats.online, stats.max));
        }
        if (stats?.version) {
          parts.push(stats.version);
        }
        lines.push(labelled(record.server.name, parts.join(', '), language));
      }
      lines.push(this.config.allowStop ? words.stopAllowed : words.stopDenied);
      message[language] = lines.join('\n');
    }
    return message;
  }

  /** What the widget shows, for one server or all of them. */
  view(deviceExternalId) {
    if (!deviceExternalId) {
      return [...this.records.values()];
    }
    const record = this.recordOf(deviceExternalId);
    return record ? [record] : [];
  }
}
