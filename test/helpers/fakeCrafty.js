// -----------------------------------------------------------------------------
// An in-memory Crafty Controller 4.11, built from the real answers recorded in
// test/fixtures/crafty: it replaces the network function of the client
// (src/crafty/http.js), so the whole integration runs without any socket.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/crafty/${name}.json`, import.meta.url), 'utf8'));

export const TOKEN = 'test-token';
export const BASE = 'https://192.0.2.10:8443';
export const SERVER_ID = 'bb985a01-5c25-4a54-8589-43811c9dbebd';

const REAL_SERVER = fixture('servers').data[0];
const STATS = {
  stopped: fixture('stats-stopped').data,
  empty: fixture('stats-running-empty').data,
  two: fixture('stats-running-two-players').data,
};
const LOGS_CLEAN = fixture('logs-clean-stop').data;
const LOGS_KILLED = fixture('logs-killed').data;

/** One server of the fake Crafty, in a state the tests change. */
export class FakeServer {
  constructor({ id = SERVER_ID, name = 'Survival', type = 'minecraft-java', state = 'two' } = {}) {
    this.raw = { ...REAL_SERVER, server_id: id, server_name: name, type };
    this.stats = { ...STATS[state] };
    this.logs = state === 'stopped' ? LOGS_KILLED : [];
    this.backups = fixture('backups');
    this.commands = [];
    this.forbidden = false;
  }

  get id() {
    return this.raw.server_id;
  }

  /** Running, with these players (names given while ≤ 12). */
  play(names, { max = 20, started } = {}) {
    const all = [...names];
    this.stats = {
      ...STATS.two,
      online: all.length,
      max,
      players: `[${all
        .slice(0, 12)
        .map((name) => `'${name}'`)
        .join(', ')}]`,
      started: started ?? this.stats.started ?? STATS.two.started,
    };
    if (!this.stats.started || this.stats.started === 'False') {
      this.stats.started = STATS.two.started;
    }
  }

  /** Stopped; `clean` writes the shutdown lines of a /stop in its log. */
  stop({ clean = true, crashed = false } = {}) {
    this.stats = { ...STATS.stopped, crashed };
    this.logs = clean ? LOGS_CLEAN : LOGS_KILLED;
  }

  /** Running, still starting: the status ping does not answer yet. */
  starting(started = '2026-10-25 11:00:00') {
    this.stats = {
      ...STATS.empty,
      int_ping_results: 'False',
      players: 'False',
      online: 0,
      max: 0,
      version: 'False',
      started,
    };
  }
}

const json = (status, body) => ({ status, headers: {}, body: JSON.stringify(body) });
const NOT_AUTHORIZED = fixture('error-not-authorized');
const BAD_TOKEN = fixture('error-bad-token');

/**
 * @param {FakeServer[]} servers
 * @returns {{ request: Function, servers: FakeServer[], requests: string[], down: boolean, ... }}
 */
export function createCrafty(servers = [new FakeServer()]) {
  const crafty = {
    servers,
    requests: [],
    /** Network failure code thrown instead of answering (ECONNREFUSED, ETIMEDOUT…). */
    down: null,
    /** Answer every request with this instead (status, body text). */
    raw: null,
    async request(url, options = {}) {
      const target = new URL(url);
      const method = options.method ?? 'GET';
      crafty.requests.push(`${method} ${target.pathname}${target.search}`);
      if (crafty.down) {
        throw Object.assign(new Error('network'), { code: crafty.down });
      }
      if (crafty.raw) {
        return { status: crafty.raw.status, headers: {}, body: crafty.raw.body };
      }
      if (target.origin !== BASE) {
        throw Object.assign(new Error('network'), { code: 'ECONNREFUSED' });
      }
      if (options.headers?.authorization !== `Bearer ${TOKEN}`) {
        return json(403, BAD_TOKEN);
      }
      const path = target.pathname;
      if (method === 'GET' && path === '/api/v2/servers') {
        return json(200, { status: 'ok', data: crafty.servers.map((server) => server.raw) });
      }
      const match = /^\/api\/v2\/servers\/([a-z0-9-]+)(\/.*)?$/u.exec(path);
      const server = match && crafty.servers.find((candidate) => candidate.id === match[1]);
      if (!server) {
        return json(400, NOT_AUTHORIZED);
      }
      if (server.forbidden) {
        return json(400, NOT_AUTHORIZED);
      }
      const rest = match[2] ?? '';
      if (method === 'GET' && rest === '/stats') {
        return json(200, { status: 'ok', data: { ...server.stats, server_id: server.raw } });
      }
      if (method === 'GET' && rest === '/backups') {
        return json(200, server.backups);
      }
      if (method === 'GET' && rest === '/logs') {
        return json(200, { status: 'ok', data: server.logs });
      }
      const action = /^\/action\/([a-z_]+)(?:\/([a-z0-9-]+))?$/u.exec(rest);
      if (method === 'POST' && action) {
        server.commands.push(action[2] ? `${action[1]}/${action[2]}` : action[1]);
        return json(200, { status: 'ok' });
      }
      return json(404, { status: 'error', error: 'NOT_FOUND' });
    },
  };
  return crafty;
}
