// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, an in-memory Crafty and a
// manual clock, with the integration wired on top through registerHandlers.
// No timer runs unless `timers: true` (with node:test mock timers): the tests
// read Crafty with `world.hub.pollAll()`. (From guim31/gladys-gamedig.)
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { BASE, FakeServer, SERVER_ID, TOKEN, createCrafty } from './fakeCrafty.js';

// The integration logs every change; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

/** A manual clock for the hub. */
export function createClock(start = Date.UTC(2026, 9, 25, 11, 0, 0)) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export const CONFIG = { url: BASE, api_token: TOKEN, language: 'en' };

/**
 * @param {object} [options]
 * @param {FakeServer[]} [options.servers]
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 */
export async function createWorld({
  clock = createClock(),
  servers,
  config = CONFIG,
  devices = [],
  connect = true,
  timings = {},
  timers = false,
} = {}) {
  const crafty = createCrafty(servers ?? [new FakeServer()]);
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    request: crafty.request,
    timers,
    timings,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, crafty, app, hub: app.hub, clock };
}

/** External ids of a server's device and features. */
export const deviceId = (gladys, id = SERVER_ID) => gladys.externalIds('server', id).device;
export const featureId = (gladys, key, id = SERVER_ID) =>
  gladys.externalIds('server', id).feature(key);

/** Add every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
}

/** The scene events fired with this key. */
export const events = (world, key) =>
  world.fake.sceneEvents.filter((event) => event.key === key).map((event) => event.data);

export { FakeServer, SERVER_ID };
