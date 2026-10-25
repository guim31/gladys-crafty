// -----------------------------------------------------------------------------
// The reading timer of the container, and the logs.
//
// Gladys 5.2 never polls a device published with should_poll: false (and
// never polls the devices created without should_poll,
// GladysAssistant/Gladys#3198): Crafty must be read by the hub's own timer,
// with no onPoll at all. After a command, Crafty is read again sooner.
//
// At the default level (info), only the lifecycle: a normal reading writes
// nothing — players coming and going included —, a failure that repeats is
// logged once, and its end once. Never the token, never a player address.
// (Adapted from guim31/gladys-gamedig.)
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIG,
  createAll,
  createClock,
  createWorld,
  deviceId,
  featureId,
} from './helpers/world.js';
import { SERVER_ID, TOKEN } from './helpers/fakeCrafty.js';

/** Let the timer callback and the fake network settle. */
const settle = async () => {
  for (let i = 0; i < 30; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

const statsReads = (w) =>
  w.crafty.requests.filter((r) => r === `GET /api/v2/servers/${SERVER_ID}/stats`).length;

test('the internal timer reads Crafty at the chosen interval, without any onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = await createWorld({
    clock: createClock(),
    config: { ...CONFIG, poll_interval: '60' },
    timers: true,
  });
  t.after(() => w.app.stop());
  const polled = t.mock.method(w.hub, 'pollDevice');
  await createAll(w);
  assert.equal(w.fake.discoveredDevices[0].should_poll, false, 'Gladys is not asked to poll');
  const before = statsReads(w);
  for (const players of [['Alice_Test'], ['Alice_Test', 'Carol'], []]) {
    w.crafty.servers[0].play(players);
    t.mock.timers.tick(60_000);
    await settle();
    assert.equal(w.fake.lastState(featureId(w.gladys, 'players_online')), players.length);
  }
  assert.equal(statsReads(w) - before, 3, 'one reading per interval');
  assert.equal(polled.mock.callCount(), 0, 'no onPoll involved');
});

test('after a command, Crafty is read again 35 s later', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = await createWorld({ config: { ...CONFIG, poll_interval: '300' }, timers: true });
  t.after(() => w.app.stop());
  await createAll(w);
  w.crafty.servers[0].stop();
  await w.hub.pollAll();
  await w.fake.sceneAction('start_server', { device: deviceId(w.gladys) });
  w.crafty.servers[0].play([]);
  const before = statsReads(w);
  t.mock.timers.tick(35_000);
  await settle();
  assert.equal(statsReads(w) - before, 1);
  assert.equal(w.fake.lastState(featureId(w.gladys, 'running')), 1);
});

/** Capture the lines of the SDK logger at a level. */
function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  const lines = [];
  const record = (...args) =>
    lines.push(args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' '));
  for (const method of ['log', 'error', 'warn', 'info']) {
    t.mock.method(console, method, record);
  }
  return { lines, clear: () => lines.splice(0) };
}

test('a normal reading cycle writes nothing at info, players coming and going included', async (t) => {
  const logs = captureLogs(t);
  const w = await createWorld();
  t.after(() => w.app.stop());
  await createAll(w);
  assert.ok(
    logs.lines.some((line) => /Connected to Crafty: 1 server/.test(line)),
    logs.lines.join('\n'),
  );
  logs.clear();
  for (const players of [['Alice_Test'], ['Alice_Test', 'Carol'], [], ['Dave']]) {
    w.crafty.servers[0].play(players);
    await w.hub.pollAll();
  }
  assert.deepEqual(logs.lines, []);
});

test('a failure is logged once, its end once, never the token', async (t) => {
  const logs = captureLogs(t);
  const w = await createWorld();
  t.after(() => w.app.stop());
  logs.clear();
  w.crafty.down = 'ECONNREFUSED';
  for (let i = 0; i < 3; i += 1) {
    await w.hub.pollAll();
  }
  w.crafty.down = null;
  await w.hub.pollAll();
  await w.hub.pollAll();
  assert.equal(logs.lines.length, 2, logs.lines.join('\n'));
  assert.match(logs.lines[0], /Crafty unreachable/);
  assert.match(logs.lines[1], /Crafty answers again/);
  // A crash: one line, without the content of the log (player addresses).
  logs.clear();
  w.crafty.servers[0].stop({ clean: false });
  await w.hub.pollAll();
  assert.equal(logs.lines.length, 1, logs.lines.join('\n'));
  assert.match(logs.lines[0], /Survival stopped unexpectedly/);
  const debug = captureLogs(t, 'debug');
  await w.hub.pollAll();
  await w.fake.configUpdated({ ...CONFIG, api_token: 'wrong' });
  for (const line of [...logs.lines, ...debug.lines]) {
    assert.ok(!line.includes(TOKEN) && !line.includes('192.0.2.30'), line);
  }
});
