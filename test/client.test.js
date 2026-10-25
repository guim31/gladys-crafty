// -----------------------------------------------------------------------------
// The Crafty client on the real answers of Crafty 4.11 (test/fixtures/crafty):
// statistics in every state, players, backups, clean or killed logs, errors.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CraftyClient,
  ERROR_KINDS,
  hasCleanStop,
  normalizeServer,
  normalizeStats,
  parsePlayers,
  toCraftyError,
} from '../src/crafty/client.js';
import { BASE, SERVER_ID, TOKEN, createCrafty, fixture } from './helpers/fakeCrafty.js';

test('the real statistics: two players, running, version, CPU and memory', () => {
  const stats = normalizeStats(fixture('stats-running-two-players').data);
  assert.equal(stats.running, true);
  assert.equal(stats.answering, true);
  assert.equal(stats.online, 2);
  assert.equal(stats.max, 20);
  assert.deepEqual(stats.players, ['Alice_Test', 'Bob_Test']);
  assert.equal(stats.namesComplete, true);
  assert.equal(stats.version, 'Paper 1.21.4');
  assert.ok(stats.cpu > 0);
  assert.ok(stats.memoryBytes > 100 * 1024 * 1024);
  assert.equal(stats.started, '2026-10-25 10:57:57');
  assert.equal(stats.crashed, false);
});

test('the real statistics of a stopped server, an importing one, an empty one', () => {
  const stopped = normalizeStats(fixture('stats-stopped').data);
  assert.deepEqual(
    [stopped.running, stopped.online, stopped.players, stopped.version, stopped.started],
    [false, 0, null, null, null],
  );
  const importing = normalizeStats(fixture('stats-importing').data);
  assert.equal(importing.importing, true);
  assert.equal(importing.version, null, '"False" is no version');
  const empty = normalizeStats(fixture('stats-running-empty').data);
  assert.equal(empty.running, true);
  assert.equal(empty.online, 0);
  assert.equal(empty.players, null, '"0" is no list');
  assert.equal(empty.namesComplete, false);
});

test('the players: a Python list, quotes and odd values', () => {
  assert.deepEqual(parsePlayers("['Alice_Test', 'Bob_Test']"), ['Alice_Test', 'Bob_Test']);
  assert.deepEqual(parsePlayers("[\"O'Neil\", 'x']"), ["O'Neil", 'x']);
  assert.deepEqual(parsePlayers('[]'), []);
  for (const none of ['False', '0', null, undefined, 3]) {
    assert.equal(parsePlayers(none), null, String(none));
  }
});

test('the server list: id, name, type, players counted', () => {
  const server = normalizeServer(fixture('servers').data[0]);
  assert.deepEqual(server, {
    id: SERVER_ID,
    name: 'Survival',
    type: 'minecraft-java',
    countsPlayers: true,
  });
  assert.equal(normalizeServer({ server_id: '../x' }), null);
});

test('a clean stop in the real log, none in the log of a killed server', () => {
  assert.equal(hasCleanStop(fixture('logs-clean-stop').data), true);
  assert.equal(hasCleanStop(fixture('logs-killed').data), false);
  assert.equal(hasCleanStop(['[Server] Server stop requested.']), true, 'Bedrock');
});

test('requests: the token in the header, the actions, the default backup', async () => {
  const crafty = createCrafty();
  const client = new CraftyClient({ url: BASE, token: TOKEN, request: crafty.request });
  assert.equal((await client.listServers()).length, 1);
  assert.equal(await client.defaultBackupId(SERVER_ID), 'd2618e51-c719-4729-b97c-9f7153b6b666');
  await client.action(SERVER_ID, 'backup_server', 'd2618e51-c719-4729-b97c-9f7153b6b666');
  assert.deepEqual(crafty.servers[0].commands, [
    'backup_server/d2618e51-c719-4729-b97c-9f7153b6b666',
  ]);
  assert.equal(await client.stoppedCleanly(SERVER_ID), false);
});

test('errors: the real refusals of Crafty, network failures, never the token', async () => {
  const crafty = createCrafty();
  const wrong = new CraftyClient({ url: BASE, token: 'wrong', request: crafty.request });
  await assert.rejects(wrong.listServers(), { kind: ERROR_KINDS.AUTH });
  const client = new CraftyClient({ url: BASE, token: TOKEN, request: crafty.request });
  crafty.servers[0].forbidden = true;
  await assert.rejects(client.stats(SERVER_ID), { kind: ERROR_KINDS.FORBIDDEN });
  assert.equal(await client.stoppedCleanly(SERVER_ID), null, 'no Logs permission: unknown');
  crafty.raw = { status: 302, body: '' };
  await assert.rejects(client.listServers(), { kind: ERROR_KINDS.REDIRECT });
  crafty.raw = { status: 500, body: '{"status":"error","error":"BOOM"}' };
  await assert.rejects(client.listServers(), { kind: ERROR_KINDS.HTTP });
  crafty.raw = null;
  crafty.down = 'ETIMEDOUT';
  await assert.rejects(client.listServers(), (err) => {
    assert.equal(err.kind, ERROR_KINDS.TIMEOUT);
    assert.ok(!err.message.includes(TOKEN));
    return true;
  });
  assert.equal(toCraftyError({ code: 'EPROTO' }).kind, ERROR_KINDS.NOT_CRAFTY);
  assert.equal(toCraftyError({ code: 'CERT_HAS_EXPIRED' }).kind, ERROR_KINDS.TLS);
  assert.equal(toCraftyError({ code: 'EHOSTUNREACH' }).kind, ERROR_KINDS.UNREACHABLE);
});
