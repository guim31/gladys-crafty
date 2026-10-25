// -----------------------------------------------------------------------------
// The scene actions and the widget: commands sent to Crafty, stop and restart
// refused until allowed, the content within the budget of the core, the
// buttons and their actions.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { TRIGGERS, WIDGET_KEY } from '../src/hub.js';
import { CONFIG, FakeServer, createAll, createWorld, deviceId, events } from './helpers/world.js';

async function world(t, { config = CONFIG, servers } = {}) {
  const w = await createWorld({ config, servers });
  t.after(() => w.app.stop());
  await createAll(w);
  return { ...w, server: w.crafty.servers[0] };
}

const ALLOWED = { ...CONFIG, allow_stop: true };
const BACKUP_ID = 'd2618e51-c719-4729-b97c-9f7153b6b666';

test('start: sent to a stopped server, not to a running one', async (t) => {
  const w = await world(t);
  let ack = await w.fake.sceneAction('start_server', { device: deviceId(w.gladys) });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, { sent: false });
  w.server.stop();
  await w.hub.pollAll();
  ack = await w.fake.sceneAction('start_server', { device: deviceId(w.gladys) });
  assert.deepEqual(ack.data.outputs, { sent: true });
  assert.deepEqual(w.server.commands, ['start_server']);
});

test('stop and restart are refused until allowed in the configuration', async (t) => {
  const w = await world(t);
  for (const key of ['stop_server', 'restart_server']) {
    const ack = await w.fake.sceneAction(key, { device: deviceId(w.gladys) });
    assert.equal(ack.success, false);
    assert.match(ack.error, /Stopping and restarting are off/);
  }
  assert.deepEqual(w.server.commands, []);
  await w.fake.configUpdated(ALLOWED);
  const ack = await w.fake.sceneAction('stop_server', { device: deviceId(w.gladys) });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(w.server.commands, ['stop_server']);
});

test('a stop asked from Gladys is no crash, even without a clean log; a restart is reported', async (t) => {
  const w = await world(t, { config: ALLOWED });
  await w.fake.sceneAction('stop_server', { device: deviceId(w.gladys) });
  w.server.stop({ clean: false });
  await w.hub.pollAll();
  assert.equal(events(w, TRIGGERS.SERVER_CRASHED).length, 0);
  await w.fake.sceneAction('restart_server', { device: deviceId(w.gladys) });
  w.server.play([], { started: '2026-10-25 12:10:00' });
  await w.hub.pollAll();
  assert.deepEqual(events(w, TRIGGERS.SERVER_RESTARTED), [
    { device: deviceId(w.gladys), server: 'Survival', after_crash: false },
  ]);
  assert.deepEqual(w.server.commands, ['stop_server', 'restart_server']);
});

test('a crash soon after a stop and a start from Gladys is still a crash (seen on a real Crafty)', async (t) => {
  const w = await world(t, { config: ALLOWED });
  await w.fake.sceneAction('stop_server', { device: deviceId(w.gladys) });
  w.server.stop({ clean: true });
  await w.hub.pollAll();
  await w.fake.sceneAction('start_server', { device: deviceId(w.gladys) });
  w.server.play([], { started: '2026-10-25 12:20:25' });
  await w.hub.pollAll();
  w.clock.advance(60_000);
  w.server.stop({ clean: false });
  await w.hub.pollAll();
  assert.equal(events(w, TRIGGERS.SERVER_CRASHED).length, 1);
});

test('backup: the default backup configuration of the server', async (t) => {
  const w = await world(t);
  const ack = await w.fake.sceneAction('backup_server', { device: deviceId(w.gladys) });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(w.server.commands, [`backup_server/${BACKUP_ID}`]);
  w.server.backups = {};
  const none = await w.fake.sceneAction('backup_server', { device: deviceId(w.gladys) });
  assert.equal(none.success, false);
  assert.match(none.error, /no backup configuration/);
});

test('a command refused by Crafty (permission missing) says so', async (t) => {
  const w = await world(t);
  w.server.stop();
  await w.hub.pollAll();
  w.server.forbidden = true;
  const ack = await w.fake.sceneAction('start_server', { device: deviceId(w.gladys) });
  assert.equal(ack.success, false);
  assert.match(ack.error, /Permission missing/);
});

test('read: the state of the server for the next steps', async (t) => {
  const w = await world(t, { config: { ...CONFIG, language: 'fr' } });
  const ack = await w.fake.sceneAction('read_server', { device: deviceId(w.gladys) });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, {
    running: true,
    players_online: 2,
    players_max: 20,
    players: 'Alice_Test, Bob_Test',
    cpu: 65,
    memory: 1054,
    version: 'Paper 1.21.4',
    server: 'Survival',
  });
  const unknown = await w.fake.sceneAction('read_server', { device: 'ext:other' });
  assert.equal(unknown.success, false);
  assert.match(unknown.error, /n'est plus dans Crafty/);
});

const content = async (w, settings = {}, language = 'en') => {
  const ack = await w.fake.widgetGet(WIDGET_KEY, { settings, language });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(validateWidgetContent(ack.data.content), []);
  return ack.data.content.components;
};

const buttons = (components) =>
  components.filter((c) => c.type === 'button').map((c) => [c.label, c.action.key]);

test('widget, one server: players, CPU, memory, who plays, Backup and Refresh', async (t) => {
  const w = await world(t);
  const components = await content(w);
  assert.deepEqual(
    components.filter((c) => c.type === 'value').map((c) => [c.label, c.value]),
    [
      ['Survival', '2/20'],
      ['CPU', 65],
      ['Memory', 1054],
    ],
  );
  const status = components.find((c) => c.type === 'status');
  assert.deepEqual(
    status.items.map((item) => [item.label, item.value]),
    [
      ['Survival', 'Running · Paper 1.21.4'],
      ['Players', 'Alice_Test, Bob_Test'],
    ],
  );
  assert.deepEqual(buttons(components), [
    ['Backup', 'backup_1'],
    ['Refresh', 'refresh'],
  ]);
  assert.ok(
    components
      .filter((c) => c.type === 'button')
      .every((c) => c.action.key === 'refresh' || c.action.confirm),
  );
});

test('widget, one server allowed to stop: Restart, Stop, Backup; stopped: Start', async (t) => {
  const w = await world(t, { config: { ...ALLOWED, language: 'fr' } });
  assert.deepEqual(buttons(await content(w, {}, 'fr')), [
    ['Redémarrer', 'restart_1'],
    ['Arrêter', 'stop_2'],
    ['Sauvegarder', 'backup_3'],
    ['Actualiser', 'refresh'],
  ]);
  w.server.stop({ clean: false });
  await w.hub.pollAll();
  const components = await content(w, {}, 'fr');
  assert.deepEqual(buttons(components), [
    ['Démarrer', 'start_1'],
    ['Sauvegarder', 'backup_2'],
    ['Actualiser', 'refresh'],
  ]);
  assert.deepEqual(components[0], {
    type: 'value',
    value: 'Planté',
    label: 'Survival',
    icon: 'alert-triangle',
    color: 'danger',
  });
});

test('widget, several servers: a tile each, Start for the stopped ones, within the budget', async (t) => {
  const servers = ['Survival', 'Creative', 'Skyblock', 'Modded'].map(
    (name, i) => new FakeServer({ id: `c0ffee00-0000-4000-8000-00000000000${i}`, name }),
  );
  servers[1].stop();
  servers[2].stop();
  const w = await world(t, { servers });
  const components = await content(w);
  assert.ok(components.length <= 8);
  assert.deepEqual(
    components.filter((c) => c.type === 'value').map((c) => [c.label, c.value]),
    [
      ['Survival', '2/20'],
      ['Creative', 'Stopped'],
      ['Skyblock', 'Stopped'],
    ],
  );
  assert.deepEqual(buttons(components), [
    ['Start Creative', 'start_1'],
    ['Start Skyblock', 'start_2'],
    ['Refresh', 'refresh'],
  ]);
  const one = await content(w, { device: deviceId(w.gladys, servers[3].id) });
  assert.equal(one[0].label, 'Modded');
});

test('widget actions: start, refused stop, refresh', async (t) => {
  const w = await world(t);
  w.server.stop();
  await w.hub.pollAll();
  const params = { device: deviceId(w.gladys) };
  let ack = await w.fake.widgetAction(WIDGET_KEY, 'start_1', params, {});
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.message.fr, 'Démarrage demandé.');
  assert.deepEqual(w.server.commands, ['start_server']);
  ack = await w.fake.widgetAction(WIDGET_KEY, 'stop_2', params, {});
  assert.equal(ack.success, false, 'checked again: the content may predate a change');
  ack = await w.fake.widgetAction(WIDGET_KEY, 'refresh', {}, {});
  assert.equal(ack.data.message.en, 'Crafty read again.');
  ack = await w.fake.widgetAction(WIDGET_KEY, 'explode_1', params, {});
  assert.equal(ack.success, false);
});

test('widget messages: nothing configured, Crafty unreachable, unknown server', async (t) => {
  const w = await world(t);
  w.crafty.down = 'ECONNREFUSED';
  await w.hub.pollAll();
  let components = await content(w);
  assert.match(components[0].text, /Crafty unreachable/);
  assert.deepEqual(buttons(components), [['Refresh', 'refresh']]);
  w.crafty.down = null;
  await w.hub.pollAll();
  components = await content(w, { device: 'ext:gone' });
  assert.match(components[0].text, /no longer in Crafty/);
  await w.fake.configUpdated({ language: 'en' });
  components = await content(w);
  assert.match(components[0].text, /Enter the address of Crafty/);
});

test('a refused restart leaves no expectation behind: a crash right after is still one', async (t) => {
  const w = await world(t, { config: ALLOWED });
  w.server.forbidden = true;
  const ack = await w.fake.sceneAction('restart_server', { device: deviceId(w.gladys) });
  assert.equal(ack.success, false);
  w.server.forbidden = false;
  w.server.stop({ clean: false });
  await w.hub.pollAll();
  assert.equal(events(w, TRIGGERS.SERVER_CRASHED).length, 1);
});
