// -----------------------------------------------------------------------------
// One Gladys device per Crafty server.
//
// Identity: the server id Crafty gives (a UUID, kept when the server is
// renamed). Features (category/type couples of the core table, see
// test/gladys-rules.test.js):
//   - running: input/binary, 1 while the server process runs in Crafty;
//   - players online, player slots: counter-sensor/integer, and the players
//     (who is playing, else how many): text/text — only for the servers whose
//     players Crafty counts (a Minecraft status ping, `count_players`);
//   - CPU: level-sensor/liquid-level-percent (the core has no generic
//     percentage; the couple Glances and OctoPrint use), memory: data/size in
//     megabytes, of the server process;
//   - version: text/text, only once the server has given one: a feature that
//     never receives a value would show "no recent value" forever.
//
// The devices are published with should_poll: false: the integration reads
// Crafty on its own timer (src/hub.js), Gladys never polls them
// (GladysAssistant/Gladys#3198).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { PLAYERS_TEXT, pick } from './texts.js';

export const DEVICE_TYPE = 'server';
export const TYPE_PARAM = 'CRAFTY_SERVER_TYPE';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  RUNNING: 'running',
  PLAYERS_ONLINE: 'players_online',
  PLAYERS_MAX: 'players_max',
  PLAYERS: 'players',
  CPU: 'cpu',
  MEMORY: 'memory',
  VERSION: 'version',
});

const PLAYER_KEYS = [FEATURE_KEYS.PLAYERS_ONLINE, FEATURE_KEYS.PLAYERS_MAX, FEATURE_KEYS.PLAYERS];

// The features published once the server has given a value for them.
export const OPTIONAL_KEYS = [FEATURE_KEYS.PLAYERS_MAX, FEATURE_KEYS.VERSION];

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [FEATURE_KEYS.RUNNING]: 'Running',
    [FEATURE_KEYS.PLAYERS_ONLINE]: 'Players online',
    [FEATURE_KEYS.PLAYERS_MAX]: 'Player slots',
    [FEATURE_KEYS.PLAYERS]: 'Players',
    [FEATURE_KEYS.CPU]: 'CPU',
    [FEATURE_KEYS.MEMORY]: 'Memory',
    [FEATURE_KEYS.VERSION]: 'Version',
  },
  fr: {
    [FEATURE_KEYS.RUNNING]: 'En marche',
    [FEATURE_KEYS.PLAYERS_ONLINE]: 'Joueurs connectés',
    [FEATURE_KEYS.PLAYERS_MAX]: 'Places',
    [FEATURE_KEYS.PLAYERS]: 'Joueurs',
    [FEATURE_KEYS.CPU]: 'Processeur',
    [FEATURE_KEYS.MEMORY]: 'Mémoire',
    [FEATURE_KEYS.VERSION]: 'Version',
  },
  de: {
    [FEATURE_KEYS.RUNNING]: 'Läuft',
    [FEATURE_KEYS.PLAYERS_ONLINE]: 'Spieler online',
    [FEATURE_KEYS.PLAYERS_MAX]: 'Spielerplätze',
    [FEATURE_KEYS.PLAYERS]: 'Spieler',
    [FEATURE_KEYS.CPU]: 'CPU',
    [FEATURE_KEYS.MEMORY]: 'Arbeitsspeicher',
    [FEATURE_KEYS.VERSION]: 'Version',
  },
  es: {
    [FEATURE_KEYS.RUNNING]: 'En marcha',
    [FEATURE_KEYS.PLAYERS_ONLINE]: 'Jugadores conectados',
    [FEATURE_KEYS.PLAYERS_MAX]: 'Plazas',
    [FEATURE_KEYS.PLAYERS]: 'Jugadores',
    [FEATURE_KEYS.CPU]: 'CPU',
    [FEATURE_KEYS.MEMORY]: 'Memoria',
    [FEATURE_KEYS.VERSION]: 'Versión',
  },
};

// Display bounds (the core never applies them on write).
export const PLAYERS_DISPLAY_MAX = 10_000;
export const MEMORY_DISPLAY_MAX_MB = 65_536;
// A text state longer than this is cut: the list of a full server.
export const MAX_TEXT_LENGTH = 250;

const MB = 1024 * 1024;

const text = (key) => ({
  key,
  definition: {
    category: DEVICE_FEATURE_CATEGORIES.TEXT,
    type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
    read_only: true,
    has_feedback: false,
    // Gladys keeps no history of a text; min/max are NOT NULL columns: 0/0.
    keep_history: false,
    min: 0,
    max: 0,
  },
});

const counter = (key) => ({
  key,
  definition: {
    category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    read_only: true,
    has_feedback: false,
    keep_history: true,
    min: 0,
    max: PLAYERS_DISPLAY_MAX,
  },
});

// Order = display order in Gladys.
const FEATURES = [
  {
    key: FEATURE_KEYS.RUNNING,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.INPUT,
      type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
      read_only: true,
      has_feedback: false,
      keep_history: true,
      min: 0,
      max: 1,
    },
  },
  counter(FEATURE_KEYS.PLAYERS_ONLINE),
  counter(FEATURE_KEYS.PLAYERS_MAX),
  text(FEATURE_KEYS.PLAYERS),
  {
    key: FEATURE_KEYS.CPU,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.LEVEL_SENSOR,
      type: DEVICE_FEATURE_TYPES.LEVEL_SENSOR.LIQUID_LEVEL_PERCENT,
      unit: DEVICE_FEATURE_UNITS.PERCENT,
      read_only: true,
      has_feedback: false,
      keep_history: true,
      min: 0,
      max: 100,
    },
  },
  {
    key: FEATURE_KEYS.MEMORY,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.DATA,
      type: DEVICE_FEATURE_TYPES.DATA.SIZE,
      unit: DEVICE_FEATURE_UNITS.MEGABYTE,
      read_only: true,
      has_feedback: false,
      keep_history: true,
      min: 0,
      max: MEMORY_DISPLAY_MAX_MB,
    },
  },
  text(FEATURE_KEYS.VERSION),
];

/** The features of a server: players if Crafty counts them, the optional ones once seen. */
const featuresOf = (server, seen) =>
  FEATURES.filter(
    ({ key }) =>
      (server.countsPlayers || !PLAYER_KEYS.includes(key)) &&
      (!OPTIONAL_KEYS.includes(key) || seen.has(key)),
  );

/** External ids of a server's device and features. */
export const deviceIds = (gladys, serverId) => gladys.externalIds(DEVICE_TYPE, serverId);

/**
 * The discovery payload of a server.
 * @param {object} gladys SDK client
 * @param {{ id: string, name: string, type: string, countsPlayers: boolean }} server
 * @param {Set<string>} seen the optional features the server has given a value for
 * @param {string} language feature names language
 */
export function buildDevice(gladys, server, seen = new Set(), language = 'fr') {
  const ids = deviceIds(gladys, server.id);
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: server.name,
    external_id: ids.device,
    should_poll: false,
    params: [{ name: TYPE_PARAM, value: server.type }],
    features: featuresOf(server, seen).map(({ key, definition }) => ({
      ...definition,
      name: names[key],
      external_id: ids.feature(key),
    })),
  };
}

export const cut = (value, max = MAX_TEXT_LENGTH) =>
  value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;

/** What the "Players" text says for a reading. */
export function playersText(stats, language) {
  const words = pick(PLAYERS_TEXT, language);
  if (!stats.running) {
    return words.stopped;
  }
  if (!stats.answering && stats.online === 0) {
    return words.starting;
  }
  if (stats.online === 0) {
    return words.nobody;
  }
  if (!stats.players || stats.players.length === 0) {
    return words.count(stats.online);
  }
  const list = stats.players.join(', ');
  if (stats.namesComplete) {
    return cut(list);
  }
  return cut(`${list} ${words.more(stats.online - stats.players.length)}`);
}

/**
 * The value of every feature of a server record (undefined: nothing to publish).
 * @param {object} record { server, stats, seen }
 * @returns {Array<{ key: string, externalId: string, state?: number, text?: string }>}
 */
export function featureStates(gladys, record, language) {
  const ids = deviceIds(gladys, record.server.id);
  const { stats } = record;
  if (!stats) {
    return [];
  }
  const values = {
    [FEATURE_KEYS.RUNNING]: stats.running ? 1 : 0,
    [FEATURE_KEYS.PLAYERS_ONLINE]: Math.min(PLAYERS_DISPLAY_MAX, stats.online),
    // The slots are only known while the server answers: keep the last value.
    [FEATURE_KEYS.PLAYERS_MAX]: stats.max > 0 ? Math.min(PLAYERS_DISPLAY_MAX, stats.max) : null,
    [FEATURE_KEYS.PLAYERS]: playersText(stats, language),
    [FEATURE_KEYS.CPU]: Math.min(100, Math.round(stats.cpu)),
    [FEATURE_KEYS.MEMORY]: Math.min(MEMORY_DISPLAY_MAX_MB, Math.round(stats.memoryBytes / MB)),
    [FEATURE_KEYS.VERSION]: stats.version ? cut(stats.version) : null,
  };
  return featuresOf(record.server, record.seen).map(({ key, definition }) => {
    const value = values[key];
    const entry = { key, externalId: ids.feature(key) };
    if (value === null || value === undefined) {
      return entry;
    }
    return definition.category === DEVICE_FEATURE_CATEGORIES.TEXT
      ? { ...entry, text: value }
      : { ...entry, state: value };
  });
}
