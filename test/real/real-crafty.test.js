// -----------------------------------------------------------------------------
// The whole integration against a REAL Crafty Controller, with the SDK's fake
// Gladys. Skipped unless CRAFTY_URL, CRAFTY_TOKEN and CRAFTY_SERVER (the id of
// a Minecraft server it may stop, start and restart) are set:
//
//   CRAFTY_URL=https://192.0.2.10:8443 CRAFTY_TOKEN=… CRAFTY_SERVER=… npm run test:real
//
// CRAFTY_CRASH_WAIT=1 also waits (two minutes) for "stopped unexpectedly":
// kill the Java process of the server meanwhile.
// Run on Crafty 4.11.0 with a Paper 1.21.4 server, inside the Docker image
// with the constraints of the Gladys sandbox (see README).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { registerHandlers } from '../../src/app.js';
import { TRIGGERS, WIDGET_KEY } from '../../src/hub.js';

const { CRAFTY_URL: url, CRAFTY_TOKEN: token, CRAFTY_SERVER: serverId } = process.env;
const skip =
  !url || !token || !serverId ? 'CRAFTY_URL, CRAFTY_TOKEN, CRAFTY_SERVER not set' : false;

process.env.LOG_LEVEL ??= 'info';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function world(config) {
  const gladys = createFakeGladys({ config: { url, api_token: token, language: 'en', ...config } });
  const app = registerHandlers(gladys, { timers: false });
  await gladys.connect();
  await app.ready;
  return { gladys, fake: gladys.fake, app, hub: app.hub };
}

/** Read Crafty every 5 s until `done` (at most `ms`). */
async function until(w, done, ms = 180_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await w.hub.pollAll();
    if (done()) {
      return true;
    }
    await sleep(5_000);
  }
  return false;
}

test(
  'real Crafty: devices, states, commands, restart, widget',
  { skip, timeout: 900_000 },
  async () => {
    const w = await world({ allow_stop: true });
    try {
      const device = w.gladys.externalIds('server', serverId).device;
      const feature = (key) => w.gladys.externalIds('server', serverId).feature(key);
      assert.equal(w.fake.connectionStatus.connected, true);
      assert.ok(w.fake.discoveredDevices.some((d) => d.external_id === device));
      for (const d of w.fake.discoveredDevices) {
        await w.fake.deviceCreated(d);
      }
      const record = () => w.hub.recordOf(device);
      const running = () => record()?.stats?.running === true;
      const answering = () => running() && record().stats.answering;

      if (!running()) {
        const ack = await w.fake.sceneAction('start_server', { device });
        assert.deepEqual(ack.data.outputs, { sent: true });
      }
      assert.ok(await until(w, answering), 'the server runs and answers');
      assert.equal(w.fake.lastState(feature('running')), 1);
      console.log('running:', JSON.stringify(record().stats));

      const report = await w.fake.action('test_connection', {});
      console.log(report.data.message.en);

      const widget = await w.fake.widgetGet(WIDGET_KEY, { settings: { device }, language: 'en' });
      assert.deepEqual(validateWidgetContent(widget.data.content), []);

      const read = await w.fake.sceneAction('read_server', { device });
      assert.equal(read.data.outputs.running, true);
      console.log('read_server:', JSON.stringify(read.data.outputs));

      const backup = await w.fake.sceneAction('backup_server', { device });
      assert.equal(backup.success, true, backup.error);

      // Restart from Gladys: reported as a restart, no crash.
      const started = record().stats.started;
      const restart = await w.fake.sceneAction('restart_server', { device });
      assert.equal(restart.success, true, restart.error);
      assert.ok(
        await until(w, () => answering() && record().stats.started !== started),
        'restarted',
      );
      assert.equal(w.fake.sceneEvents.filter((e) => e.key === TRIGGERS.SERVER_RESTARTED).length, 1);

      // Clean stop from Gladys: no crash.
      const stop = await w.fake.sceneAction('stop_server', { device });
      assert.equal(stop.success, true, stop.error);
      assert.ok(await until(w, () => !running()), 'stopped');
      assert.equal(w.fake.lastState(feature('running')), 0);

      if (process.env.CRAFTY_CRASH_WAIT === '1') {
        await w.fake.sceneAction('start_server', { device });
        assert.ok(await until(w, answering), 'running again');
        console.log('NOW KILL THE SERVER PROCESS');
        assert.ok(
          await until(
            w,
            () => w.fake.sceneEvents.some((e) => e.key === TRIGGERS.SERVER_CRASHED),
            120_000,
          ),
          'crash seen',
        );
      }
      assert.equal(
        w.fake.sceneEvents.filter((e) => e.key === TRIGGERS.SERVER_CRASHED).length,
        process.env.CRAFTY_CRASH_WAIT === '1' ? 1 : 0,
      );
      console.log('events:', w.fake.sceneEvents.map((e) => e.key).join(', '));
    } finally {
      await w.app.stop();
    }
  },
);

test('real Crafty: a wrong token, a strict certificate check', { skip }, async () => {
  let w = await world({ api_token: 'wrong-token' });
  assert.match(w.fake.connectionStatus.message.en, /API token refused/);
  await w.app.stop();
  w = await world({ allow_self_signed: false });
  assert.match(w.fake.connectionStatus.message.en, /Certificate refused/);
  await w.app.stop();
});
