// -----------------------------------------------------------------------------
// Crafty Controller client: the REST API v2 of a self-hosted Crafty 4,
// authenticated by an API token (`Authorization: Bearer`), created in Crafty
// (Users → the user → API Keys → "Get token").
//
//   GET  /api/v2/servers                          servers the token can see
//   GET  /api/v2/servers/<id>/stats               the last statistics Crafty
//                                                 recorded (every 30 s by default)
//   GET  /api/v2/servers/<id>/backups             backup configurations (a bare
//                                                 object keyed by backup id, no
//                                                 `status` wrapper)
//   GET  /api/v2/servers/<id>/logs?file=true      the current log file, one line
//                                                 per entry (the "Logs" permission)
//   POST /api/v2/servers/<id>/action/<action>[/<backup id>]
//                                                 start_server, stop_server,
//                                                 restart_server, backup_server:
//                                                 queued, 200 at once
//
// Checked on Crafty 4.11.0 (test/fixtures/crafty hold its answers). Crafty
// answers 403 ACCESS_DENIED to a bad token, 400 NOT_AUTHORIZED when the token
// lacks a permission. In the statistics, a value it does not have is the
// string "False"; the players are the Python repr of a list of names
// ("['Alice', 'Bob']") as given by the Minecraft status ping (12 names at most).
//
// Redirects are not followed: the token would be sent to wherever the address
// points. The log lines are only searched for a clean shutdown, never kept nor
// logged (they hold the addresses of the players).
// -----------------------------------------------------------------------------

import { httpRequest as defaultRequest } from './http.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TIMEOUT: 'timeout', // no answer in time
  TLS: 'tls', // the certificate does not verify
  AUTH: 'auth', // token refused (or missing)
  FORBIDDEN: 'forbidden', // the token lacks a permission on this server
  NOT_CRAFTY: 'not_crafty', // something answers, not the Crafty API
  REDIRECT: 'redirect', // the address redirects (usually HTTP to HTTPS)
  HTTP: 'http', // any other HTTP error
});

export class CraftyError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message English, for the logs (never contains a secret)
   * @param {object} [extra] { status }
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'CraftyError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

export const ACTIONS = Object.freeze({
  START: 'start_server',
  STOP: 'stop_server',
  RESTART: 'restart_server',
  BACKUP: 'backup_server',
});

// Crafty writes these when a server shuts down on request (its Stop button, a
// /stop typed in the console, a restart): a log without any is a crash.
// Java: "Stopping server"; Bedrock: "Server stop requested.", "Quit correctly".
const CLEAN_STOP = /Stopping (the )?server|Server stop requested|Quit correctly/iu;

/** Crafty's "no value": the string "False", null, an empty string. */
const present = (value) =>
  value !== null && value !== undefined && value !== 'False' && value !== false && value !== '';

const textOf = (value, max = 255) =>
  present(value) && typeof value === 'string' ? value.trim().slice(0, max) || null : null;

const numberOf = (value) => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
};

const countOf = (value) => {
  const number = numberOf(value);
  return number !== null && number >= 0 ? Math.round(number) : 0;
};

/**
 * The player names of the statistics: the repr of a Python list of strings,
 * "['Alice_Test', 'Bob_Test']". Anything else ("False", "0") gives none.
 * @returns {string[]|null} null when Crafty gives no list
 */
export function parsePlayers(value) {
  if (Array.isArray(value)) {
    return value.filter((name) => typeof name === 'string' && name).map((name) => name.trim());
  }
  if (typeof value !== 'string' || !value.trim().startsWith('[')) {
    return null;
  }
  const names = [];
  for (const match of value.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/gu)) {
    const name = (match[1] ?? match[2]).replace(/\\(.)/gu, '$1').trim();
    if (name) {
      names.push(name.slice(0, 64));
    }
  }
  return names;
}

/** One server of the list, normalized: only what the integration uses. */
export function normalizeServer(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const id = typeof raw.server_id === 'string' ? raw.server_id.trim() : '';
  if (!/^[A-Za-z0-9-]{1,64}$/u.test(id)) {
    return null;
  }
  return {
    id,
    name: textOf(raw.server_name, 100) ?? id,
    // minecraft-java, minecraft-bedrock, hytale, steam, …
    type: textOf(raw.type, 40) ?? 'unknown',
    // Crafty counts the players of this server (a Minecraft status ping).
    countsPlayers: raw.count_players !== false,
  };
}

/** The statistics of a server, normalized. */
export function normalizeStats(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  const running = data.running === true;
  const players = running ? parsePlayers(data.players) : null;
  const online = running ? countOf(data.online) : 0;
  const cpu = numberOf(data.cpu);
  const mem = numberOf(data.mem);
  return {
    running,
    // When the server process started, as Crafty writes it: a new value while
    // running means a restart. Only compared, never parsed (no time zone).
    started: running ? textOf(data.started, 40) : null,
    // The server answers the Minecraft status ping (players and version known).
    answering: data.int_ping_results === 'True' || data.int_ping_results === true,
    online,
    max: running ? countOf(data.max) : 0,
    players,
    namesComplete: players !== null && players.length >= online,
    cpu: running && cpu !== null ? Math.max(0, cpu) : 0,
    memoryBytes: running && mem !== null ? Math.max(0, mem) : 0,
    version: textOf(data.version, 100),
    worldName: textOf(data.world_name, 100),
    crashed: data.crashed === true,
    starting: data.waiting_start === true,
    updating: data.updating === true,
    importing: data.importing === true,
  };
}

export const hasCleanStop = (lines) =>
  Array.isArray(lines) && lines.some((line) => typeof line === 'string' && CLEAN_STOP.test(line));

export class CraftyClient {
  /**
   * @param {object} options
   * @param {string} options.url base address, e.g. https://192.168.1.10:8443
   * @param {string} options.token API token
   * @param {boolean} [options.insecure] accept a self-signed certificate
   * @param {number} [options.timeoutMs]
   * @param {Function} [options.request] the network seam (tests)
   */
  constructor({ url, token, insecure = false, timeoutMs = 10_000, request = defaultRequest }) {
    this.base = url.replace(/\/+$/u, '');
    this.token = token;
    this.insecure = insecure;
    this.timeoutMs = timeoutMs;
    this.request = request;
  }

  /** One API call: the parsed JSON, or a CraftyError. */
  async call(path, { method = 'GET', raw = false } = {}) {
    let response;
    try {
      response = await this.request(`${this.base}/api/v2${path}`, {
        method,
        headers: { authorization: `Bearer ${this.token}`, accept: 'application/json' },
        insecure: this.insecure,
        timeoutMs: this.timeoutMs,
      });
    } catch (err) {
      throw toCraftyError(err);
    }
    const { status } = response;
    if (status >= 300 && status < 400) {
      throw new CraftyError(ERROR_KINDS.REDIRECT, `Crafty redirects (HTTP ${status})`, { status });
    }
    let body;
    try {
      body = JSON.parse(response.body);
    } catch {
      body = null;
    }
    if (status === 401 || status === 403) {
      throw new CraftyError(ERROR_KINDS.AUTH, `Token refused (HTTP ${status})`, { status });
    }
    if (status === 400 && body?.error === 'NOT_AUTHORIZED') {
      throw new CraftyError(ERROR_KINDS.FORBIDDEN, 'Permission missing for this server', {
        status,
      });
    }
    if (!body || typeof body !== 'object') {
      throw new CraftyError(ERROR_KINDS.NOT_CRAFTY, `Not the Crafty API (HTTP ${status})`, {
        status,
      });
    }
    if (status !== 200 || (!raw && body.status !== 'ok')) {
      const code = typeof body.error === 'string' ? body.error.slice(0, 60) : '';
      throw new CraftyError(ERROR_KINDS.HTTP, `Crafty answered HTTP ${status} ${code}`.trim(), {
        status,
      });
    }
    return raw ? body : body.data;
  }

  async listServers() {
    const data = await this.call('/servers');
    if (!Array.isArray(data)) {
      throw new CraftyError(ERROR_KINDS.NOT_CRAFTY, 'Unexpected server list');
    }
    return data.map(normalizeServer).filter(Boolean);
  }

  async stats(serverId) {
    return normalizeStats(await this.call(`/servers/${encodeURIComponent(serverId)}/stats`));
  }

  /** The backup to run: the default configuration, else the first enabled one. */
  async defaultBackupId(serverId) {
    const data = await this.call(`/servers/${encodeURIComponent(serverId)}/backups`, {
      raw: true,
    });
    const backups = Object.values(data ?? {}).filter(
      (backup) => backup && typeof backup === 'object' && typeof backup.backup_id === 'string',
    );
    const chosen =
      backups.find((backup) => backup.default === true) ??
      backups.find((backup) => backup.enabled !== false);
    return chosen?.backup_id ?? null;
  }

  /** Whether the current log file shows a clean shutdown; null when unreadable. */
  async stoppedCleanly(serverId) {
    try {
      const lines = await this.call(`/servers/${encodeURIComponent(serverId)}/logs?file=true`);
      return hasCleanStop(lines);
    } catch (err) {
      if (err instanceof CraftyError && err.kind !== ERROR_KINDS.UNREACHABLE) {
        return null;
      }
      throw err;
    }
  }

  async action(serverId, action, actionId = null) {
    const suffix = actionId ? `/${encodeURIComponent(actionId)}` : '';
    await this.call(`/servers/${encodeURIComponent(serverId)}/action/${action}${suffix}`, {
      method: 'POST',
    });
  }
}

/** A network failure as a CraftyError (never with the address nor the token). */
export function toCraftyError(err) {
  if (err instanceof CraftyError) {
    return err;
  }
  const code = err?.code ?? err?.cause?.code;
  if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') {
    return new CraftyError(ERROR_KINDS.TIMEOUT, 'Crafty did not answer in time');
  }
  if (TLS_CODES.has(code)) {
    return new CraftyError(ERROR_KINDS.TLS, `Certificate refused (${code})`);
  }
  if (code === 'EPROTO' || code === 'ERR_SSL_WRONG_VERSION_NUMBER') {
    return new CraftyError(ERROR_KINDS.NOT_CRAFTY, 'HTTP and HTTPS mixed up');
  }
  if (code === 'ERESPONSETOOLARGE') {
    return new CraftyError(ERROR_KINDS.NOT_CRAFTY, 'Answer too large');
  }
  return new CraftyError(ERROR_KINDS.UNREACHABLE, `Crafty unreachable (${code ?? 'error'})`);
}
