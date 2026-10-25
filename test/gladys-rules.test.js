// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from realistic
// fixtures (the real Crafty 4.11 answers): Java servers with players, a server
// whose players Crafty does not count, stopped and starting servers, in every
// feature-name language.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// (Adapted from guim31/gladys-wled.)
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CONFIG, FakeServer, createAll, createWorld } from './helpers/world.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

function servers({ stopped = false } = {}) {
  const survival = new FakeServer();
  const creative = new FakeServer({ id: 'c0ffee00-0000-4000-8000-000000000002', name: 'Creative' });
  creative.play([]);
  const crowded = new FakeServer({ id: 'c0ffee00-0000-4000-8000-000000000003', name: 'Big one' });
  crowded.play(
    Array.from({ length: 30 }, (_, i) => `Player_${i}`),
    { max: 30 },
  );
  const steam = new FakeServer({
    id: 'c0ffee00-0000-4000-8000-000000000004',
    name: 'Valheim',
    type: 'steam',
  });
  steam.raw.count_players = false;
  const bedrock = new FakeServer({
    id: 'c0ffee00-0000-4000-8000-000000000005',
    name: 'Bedrock',
    type: 'minecraft-bedrock',
  });
  bedrock.starting();
  const all = [survival, creative, crowded, steam, bedrock];
  if (stopped) {
    for (const server of all) {
      server.stop({ clean: false });
    }
  }
  return all;
}

const scenarios = [
  { label: 'one server', servers: () => [new FakeServer()], count: 1 },
  { label: 'five servers', config: CONFIG, count: 5 },
  { label: 'French names', config: { ...CONFIG, language: 'fr' }, count: 5 },
  { label: 'German names', config: { ...CONFIG, language: 'de' }, count: 5 },
  { label: 'Spanish names', config: { ...CONFIG, language: 'es' }, count: 5 },
  { label: 'stopped servers', config: CONFIG, count: 5, stopped: true },
];

for (const scenario of scenarios) {
  test(`every discovered device follows the Gladys rules (${scenario.label})`, async () => {
    const list = scenario.servers ? scenario.servers() : servers();
    const { app, hub, fake } = await createWorld({ config: scenario.config, servers: list });
    try {
      await createAll({ fake });
      if (scenario.stopped) {
        for (const server of list) {
          server.stop({ clean: false });
        }
        await hub.pollAll();
      }
      const devices = fake.discoveredDevices;
      assert.equal(devices.length, scenario.count);

      for (const device of devices) {
        const where = device.name;

        // should_poll: true if and only if poll_frequency is provided, in ms.
        if (device.poll_frequency === undefined) {
          assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
        } else {
          assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
          assert.ok(
            table.poll_frequencies_ms.includes(device.poll_frequency),
            `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
          );
        }

        assert.ok(device.features.length > 0, `${where}: no feature`);
        const externalIds = new Set();
        const names = new Set();
        for (const feature of device.features) {
          const at = `${where} / ${feature.name}`;
          const pair = table.pairs[`${feature.category}/${feature.type}`];
          assert.ok(
            pair,
            `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`,
          );
          assert.ok(
            pair.label_en && pair.label_fr && pair.icon,
            `${at}: couple without label or icon`,
          );

          assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
          assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
          assert.ok(
            Number.isFinite(feature.min) && Number.isFinite(feature.max),
            `${at}: finite min/max`,
          );
          assert.ok(feature.min <= feature.max, `${at}: min > max`);
          assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
          assert.equal(
            typeof feature.has_feedback,
            'boolean',
            `${at}: has_feedback must be a boolean`,
          );
          if (feature.unit !== undefined) {
            assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
          }

          assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
          externalIds.add(feature.external_id);
          assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
          names.add(feature.name);

          // The value read from the fixtures fits the declared bounds; a text is never empty.
          const value = fake.lastState(feature.external_id);
          if (feature.category === 'text') {
            assert.equal(typeof value, 'string', `${at}: no text published`);
            assert.ok(value.trim().length > 0, `${at}: empty text`);
          } else {
            assert.equal(typeof value, 'number', `${at}: no state published`);
            assert.ok(
              value >= feature.min && value <= feature.max,
              `${at}: ${value} out of bounds`,
            );
            if (feature.type === 'integer' || feature.type === 'binary') {
              assert.ok(Number.isInteger(value), `${at}: ${value} is not an integer`);
            }
          }
        }
      }
      // Every state went to a feature that exists.
      const known = new Set(devices.flatMap((device) => device.features.map((f) => f.external_id)));
      for (const state of fake.states) {
        assert.ok(known.has(state.device_feature_external_id), state.device_feature_external_id);
      }
    } finally {
      await app.stop();
    }
  });
}
