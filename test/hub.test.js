// -----------------------------------------------------------------------------
// The hub against the in-memory Crafty (real 4.11 answers): devices and
// states, scene events on transitions, crashes told from clean stops, restarts,
// errors and the connection status, the report.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRIGGERS, WIDGET_KEY } from '../src/hub.js';
import {
  CONFIG,
  FakeServer,
  SERVER_ID,
  createAll,
  createWorld,
  deviceId,
  events,
  featureId,
} from './helpers/world.js';

async function world(t, { servers, config = CONFIG, create = true, clock } = {}) {
  const w = await createWorld({ servers, config, ...(clock ? { clock } : {}) });
  t.after(() => w.app.stop());
  if (create) {
    await createAll(w);
  }
  return { ...w, server: w.crafty.servers[0] };
}

const state = (w, key, id) => w.fake.lastState(featureId(w.gladys, key, id));

test('one device per server, with the real Crafty 4.11 values', async (t) => {
  const w = await world(t);
  const [device] = w.fake.discoveredDevices;
  assert.equal(device.name, 'Survival');
  assert.equal(device.external_id, deviceId(w.gladys));
  assert.equal(device.should_poll, false);
  assert.deepEqual(device.params, [{ name: 'CRAFTY_SERVER_TYPE', value: 'minecraft-java' }]);
  assert.deepEqual(
    device.features.map((feature) => feature.external_id.split(':').pop()),
    ['running', 'players_online', 'players_max', 'players', 'cpu', 'memory', 'version'],
  );
  assert.equal(state(w, 'running'), 1);
  assert.equal(state(w, 'players_online'), 2);
  assert.equal(state(w, 'players_max'), 20);
  assert.equal(state(w, 'players'), 'Alice_Test, Bob_Test');
  assert.equal(state(w, 'cpu'), 65);
  assert.equal(state(w, 'memory'), 1054);
  assert.equal(state(w, 'version'), 'Paper 1.21.4');
  assert.deepEqual(w.fake.transports.at(-1), {
    device_external_id: deviceId(w.gladys),
    transport: 'local',
  });
  assert.equal(w.fake.connectionStatus.connected, true);
});

test('a server whose players Crafty does not count has no player features', async (t) => {
  const steam = new FakeServer({ name: 'Valheim', type: 'steam' });
  steam.raw.count_players = false;
  const w = await world(t, { servers: [steam] });
  assert.deepEqual(
    w.fake.discoveredDevices[0].features.map((feature) => feature.external_id.split(':').pop()),
    ['running', 'cpu', 'memory', 'version'],
  );
});

test('slots and version only appear once the server has given them', async (t) => {
  const server = new FakeServer();
  server.starting();
  const w = await world(t, { servers: [server] });
  const keys = () =>
    w.fake.discoveredDevices[0].features.map((feature) => feature.external_id.split(':').pop());
  assert.deepEqual(keys(), ['running', 'players_online', 'players', 'cpu', 'memory']);
  assert.equal(state(w, 'players'), 'Server starting');
  server.play([]);
  await w.hub.pollAll();
  assert.deepEqual(keys(), [
    'running',
    'players_online',
    'players_max',
    'players',
    'cpu',
    'memory',
    'version',
  ]);
  assert.equal(state(w, 'players'), 'Nobody');
});

test('states go only to the devices added to Gladys, all of them again when one is added', async (t) => {
  const w = await world(t, { create: false });
  assert.equal(w.fake.states.length, 0);
  await w.hub.pollAll();
  assert.equal(w.fake.states.length, 0);
  const refreshes = w.fake.widgetRefreshes.length;
  await createAll(w);
  assert.equal(state(w, 'players'), 'Alice_Test, Bob_Test');
  assert.ok(w.fake.widgetRefreshes.length > refreshes);
  assert.equal(w.fake.widgetRefreshes.at(-1), WIDGET_KEY);
});

test('only the changes are published', async (t) => {
  const w = await world(t);
  const before = w.fake.states.length;
  await w.hub.pollAll();
  assert.equal(w.fake.states.length, before);
  w.server.play(['Alice_Test']);
  await w.hub.pollAll();
  const sent = w.fake.states
    .slice(before)
    .map((s) => s.device_feature_external_id.split(':').pop());
  assert.deepEqual(sent.sort(), ['players', 'players_online']);
});

test('players joining and leaving, by name, with the minutes played', async (t) => {
  const w = await world(t);
  w.server.play(['Alice_Test', 'Bob_Test', 'Carol']);
  await w.hub.pollAll();
  w.clock.advance(30 * 60_000);
  w.server.play(['Alice_Test', 'Bob_Test']);
  await w.hub.pollAll();
  assert.deepEqual(events(w, TRIGGERS.PLAYER_JOINED), [
    {
      device: deviceId(w.gladys),
      server: 'Survival',
      players_online: 3,
      players_max: 20,
      player: 'Carol',
    },
  ]);
  const [left] = events(w, TRIGGERS.PLAYER_LEFT);
  assert.equal(left.player, 'Carol');
  assert.equal(left.minutes_played, 30);
  assert.equal(left.players_online, 2);
});

test('the first reading is a starting point: no event', async (t) => {
  const w = await world(t);
  assert.equal(w.fake.sceneEvents.length, 0);
});

test('beyond 12 players Minecraft gives no full list: events by count, without name', async (t) => {
  const many = Array.from({ length: 14 }, (_, i) => `P${i}`);
  const server = new FakeServer();
  server.play(many);
  const w = await world(t, { servers: [server] });
  assert.equal(state(w, 'players'), 'P0, P1, P2, P3, P4, P5, P6, P7, P8, P9, P10, P11 and 2 more');
  server.play([...many, 'P14']);
  await w.hub.pollAll();
  assert.deepEqual(
    events(w, TRIGGERS.PLAYER_JOINED).map((event) => event.player),
    [''],
  );
});

test('emptied and full', async (t) => {
  const w = await world(t);
  w.server.play(['a', 'b'], { max: 3 });
  await w.hub.pollAll();
  w.server.play(['a', 'b', 'c'], { max: 3 });
  await w.hub.pollAll();
  assert.equal(events(w, TRIGGERS.SERVER_FULL).length, 1);
  w.server.play([], { max: 3 });
  await w.hub.pollAll();
  assert.deepEqual(events(w, TRIGGERS.SERVER_EMPTY), [
    { device: deviceId(w.gladys), server: 'Survival', players_max: 3 },
  ]);
  // Alice and Bob before, then a, b and c.
  assert.equal(events(w, TRIGGERS.PLAYER_LEFT).length, 5);
});

test('a stop with a clean shutdown in the log is no crash, and leaves no player event', async (t) => {
  const w = await world(t);
  w.server.stop({ clean: true });
  await w.hub.pollAll();
  assert.equal(state(w, 'running'), 0);
  assert.equal(state(w, 'players_online'), 0);
  assert.equal(state(w, 'players'), 'Server stopped');
  assert.equal(state(w, 'players_max'), 20, 'the slots keep their last value');
  assert.deepEqual(w.fake.sceneEvents, []);
  assert.ok(w.crafty.requests.includes(`GET /api/v2/servers/${SERVER_ID}/logs?file=true`));
});

test('a stop without a clean shutdown (the real log of a killed server) is a crash, then a restart', async (t) => {
  const w = await world(t);
  w.server.stop({ clean: false });
  await w.hub.pollAll();
  assert.deepEqual(events(w, TRIGGERS.SERVER_CRASHED), [
    { device: deviceId(w.gladys), server: 'Survival' },
  ]);
  w.clock.advance(3 * 60 * 60_000);
  w.server.play([], { started: '2026-10-25 14:00:00' });
  await w.hub.pollAll();
  assert.deepEqual(events(w, TRIGGERS.SERVER_RESTARTED), [
    { device: deviceId(w.gladys), server: 'Survival', after_crash: true },
  ]);
});

test("Crafty's crash flag is a crash, even when the log cannot be read", async (t) => {
  const w = await world(t);
  w.server.stop({ clean: true, crashed: true });
  await w.hub.pollAll();
  assert.equal(events(w, TRIGGERS.SERVER_CRASHED).length, 1);
});

test('an unreadable log (no Logs permission) is no crash', async (t) => {
  const w = await world(t);
  w.server.stop({ clean: false });
  w.server.logs = null;
  const request = w.crafty.request;
  w.crafty.request = async (url, options) =>
    url.includes('/logs')
      ? { status: 400, headers: {}, body: '{"status":"error","error":"NOT_AUTHORIZED"}' }
      : request(url, options);
  w.hub.client.request = w.crafty.request;
  await w.hub.pollAll();
  assert.equal(events(w, TRIGGERS.SERVER_CRASHED).length, 0);
});

test('a plain start after a clean stop is no restart event (the device state says it)', async (t) => {
  const w = await world(t);
  w.server.stop({ clean: true });
  await w.hub.pollAll();
  w.clock.advance(10 * 60_000);
  w.server.play([], { started: '2026-10-25 12:00:00' });
  await w.hub.pollAll();
  assert.equal(events(w, TRIGGERS.SERVER_RESTARTED).length, 0);
  assert.equal(state(w, 'running'), 1);
});

test('a restart seen between two readings (new start time) fires the restart', async (t) => {
  const w = await world(t);
  w.server.play(['Alice_Test'], { started: '2026-10-25 12:30:00' });
  await w.hub.pollAll();
  assert.deepEqual(events(w, TRIGGERS.SERVER_RESTARTED), [
    { device: deviceId(w.gladys), server: 'Survival', after_crash: false },
  ]);
  assert.equal(events(w, TRIGGERS.PLAYER_LEFT).length, 0, 'a restart is a new starting point');
});

test('a server removed from Crafty disappears from the discovery', async (t) => {
  const other = new FakeServer({ id: 'c0ffee00-0000-4000-8000-000000000002', name: 'Creative' });
  const w = await world(t, { servers: [new FakeServer(), other] });
  assert.equal(w.fake.discoveredDevices.length, 2);
  w.crafty.servers.pop();
  await w.hub.pollAll();
  assert.deepEqual(
    w.fake.discoveredDevices.map((device) => device.name),
    ['Survival'],
  );
});

test('Crafty unreachable: connection status, transports, no state change, then back', async (t) => {
  const w = await world(t);
  const before = w.fake.states.length;
  w.crafty.down = 'ECONNREFUSED';
  await w.hub.pollAll();
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /Crafty unreachable/);
  assert.equal(w.fake.transports.at(-1).transport, 'unreachable');
  assert.equal(w.fake.states.length, before);
  w.crafty.down = null;
  await w.hub.pollAll();
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.equal(w.fake.transports.at(-1).transport, 'local');
});

test('a refused token, a refused certificate, a page that is not Crafty', async (t) => {
  const w = await world(t, { config: { ...CONFIG, api_token: 'wrong' }, create: false });
  assert.equal(w.fake.connectionStatus.message.fr, "Jeton d'API refusé par Crafty");
  w.crafty.down = 'DEPTH_ZERO_SELF_SIGNED_CERT';
  await w.hub.pollAll();
  assert.match(w.fake.connectionStatus.message.en, /self-signed/);
  w.crafty.down = null;
  w.crafty.raw = { status: 200, body: '<html>router</html>' };
  await w.hub.pollAll();
  assert.match(w.fake.connectionStatus.message.en, /not the Crafty API/);
});

test('nothing configured, an address not understood', async (t) => {
  const w = await world(t, { config: { language: 'en' }, create: false });
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /Enter the address of Crafty/);
  assert.equal(w.crafty.requests.length, 0);
  await w.fake.configUpdated({ ...CONFIG, url: 'ftp://crafty' });
  assert.match(w.fake.connectionStatus.message.en, /Address not understood/);
});

test('a token that sees no server', async (t) => {
  const w = await world(t, { servers: [], create: false });
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /sees no server/);
  assert.deepEqual(w.fake.discoveredDevices, []);
});

test('"Test the connection" lists the servers', async (t) => {
  const stopped = new FakeServer({ id: 'c0ffee00-0000-4000-8000-000000000002', name: 'Creative' });
  stopped.stop();
  const w = await world(t, { servers: [new FakeServer(), stopped] });
  const ack = await w.fake.action('test_connection', {});
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.message.fr.split('\n'), [
    'Crafty répond : 2 serveur(s).',
    'Survival : en marche, 2/20 joueurs, Paper 1.21.4',
    'Creative : arrêté',
    'Arrêt et redémarrage non autorisés (voir la configuration).',
  ]);
});

test('the feature names follow the configured language; a new language republishes the texts', async (t) => {
  const w = await world(t, { config: { ...CONFIG, language: 'fr' } });
  assert.equal(w.fake.discoveredDevices[0].features[0].name, 'En marche');
  w.server.stop();
  await w.hub.pollAll();
  assert.equal(state(w, 'players'), 'Serveur arrêté');
  await w.fake.configUpdated({ ...CONFIG, language: 'de' });
  assert.equal(state(w, 'players'), 'Server gestoppt');
  assert.equal(w.fake.discoveredDevices[0].features[0].name, 'Läuft');
});

test('a renamed server keeps its device', async (t) => {
  const w = await world(t);
  w.server.raw.server_name = 'Survival 2';
  await w.hub.pollAll();
  assert.equal(w.fake.discoveredDevices[0].name, 'Survival 2');
  assert.equal(w.fake.discoveredDevices[0].external_id, deviceId(w.gladys));
});

test('a clean stop then a start soon after (the Restart button of Crafty) is a restart', async (t) => {
  const w = await world(t);
  w.server.stop({ clean: true });
  await w.hub.pollAll();
  w.clock.advance(30_000);
  w.server.play([], { started: '2026-10-25 12:31:00' });
  await w.hub.pollAll();
  assert.deepEqual(events(w, TRIGGERS.SERVER_RESTARTED), [
    { device: deviceId(w.gladys), server: 'Survival', after_crash: false },
  ]);
});

test('unreadable statistics: no state published (not even the heartbeat), the widget says unknown', async (t) => {
  const w = await world(t);
  const before = w.fake.states.length;
  w.server.forbidden = true;
  w.server.play(['Alice_Test']);
  await w.hub.pollAll();
  assert.equal(w.fake.states.length, before);
  const ack = await w.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'en' });
  assert.equal(ack.data.content.components[0].value, 'Unknown');
  const read = await w.fake.sceneAction('read_server', { device: deviceId(w.gladys) });
  assert.equal(read.success, false);
  assert.match(read.error, /Permission missing/);
  w.server.forbidden = false;
  await w.hub.pollAll();
  assert.equal(state(w, 'players_online'), 1);
});

test('a new token while a reading is under way: the new configuration is read at once', async (t) => {
  const w = await world(t);
  let release;
  const request = w.crafty.request;
  // Only the first request waits: the reading under way.
  w.hub.client.request = async (url, options) => {
    w.hub.client.request = request;
    await new Promise((resolve) => {
      release = resolve;
    });
    return request(url, options);
  };
  const old = w.hub.pollAll();
  const reconfigured = w.fake.configUpdated({ ...CONFIG, api_token: 'wrong' });
  await new Promise((resolve) => setImmediate(resolve));
  release();
  await old;
  await reconfigured;
  // The old reading did not fill the new configuration: the new token is
  // read at once, and refused.
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.equal(w.fake.connectionStatus.message.en, 'API token refused by Crafty');
  assert.equal(w.hub.records.size, 0);
});
