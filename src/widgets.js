// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `crafty_servers`.
//
// The use case: the tablet in the living room shows whether the Minecraft
// server of the kids is running and who is on it, and starts it (or backs it
// up) without opening Crafty. So: one tile per server (players online /
// slots, or its state), a status list with each server's state and who is
// playing, then the buttons — Start for a stopped server, Stop and Restart
// only when the configuration allows them, Backup for a single server — each
// confirmed first (`confirm`), and Refresh.
//
// One server (chosen in the widget settings, or the only one): three tiles
// (players, CPU, memory). Several: one tile each, three at most. Budget
// (8 components, 4 buttons): three tiles, one status list, three command
// buttons, Refresh. The values are sent as values, not bound to device
// features, so the widget works before the devices are added to Gladys. The
// core gives the user's language: texts are localized with it.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { ACTIONS } from './crafty/client.js';
import { deviceIds } from './devices.js';
import { WIDGET_KEY } from './hub.js';
import { ACTION_TEXT, CONNECTION_TEXT, ERROR_TEXT, pick } from './texts.js';

export const MAX_SERVERS = 3;
export const MAX_ROWS = 10;
// The core keeps 4 buttons per widget: three commands and Refresh.
export const MAX_BUTTONS = 3;

// Widget action verbs (internal to the widget content: never stored by users).
const VERBS = {
  start: ACTIONS.START,
  stop: ACTIONS.STOP,
  restart: ACTIONS.RESTART,
  backup: ACTIONS.BACKUP,
};
export const REFRESH = 'refresh';

export const TEXT = {
  unknown: {
    en: 'This server is no longer in Crafty: choose another one in the widget settings.',
    fr: "Ce serveur n'est plus dans Crafty : choisissez-en un autre dans les réglages du widget.",
    de: 'Dieser Server ist nicht mehr in Crafty: Wähle einen anderen in den Widget-Einstellungen.',
    es: 'Este servidor ya no está en Crafty: elija otro en la configuración del widget.',
  },
  players: { en: 'Players', fr: 'Joueurs', de: 'Spieler', es: 'Jugadores' },
  cpu: { en: 'CPU', fr: 'Processeur', de: 'CPU', es: 'CPU' },
  memory: { en: 'Memory', fr: 'Mémoire', de: 'Speicher', es: 'Memoria' },
  running: { en: 'Running', fr: 'En marche', de: 'Läuft', es: 'En marcha' },
  stopped: { en: 'Stopped', fr: 'Arrêté', de: 'Gestoppt', es: 'Detenido' },
  crashed: { en: 'Crashed', fr: 'Planté', de: 'Abgestürzt', es: 'Caído' },
  starting: { en: 'Starting…', fr: 'Démarrage…', de: 'Startet…', es: 'Arrancando…' },
  waiting: { en: 'Waiting…', fr: 'En attente…', de: 'Warte…', es: 'Esperando…' },
  nobody: { en: 'Nobody', fr: 'Personne', de: 'Niemand', es: 'Nadie' },
  start: { en: 'Start', fr: 'Démarrer', de: 'Starten', es: 'Arrancar' },
  stop: { en: 'Stop', fr: 'Arrêter', de: 'Stoppen', es: 'Detener' },
  restart: { en: 'Restart', fr: 'Redémarrer', de: 'Neustarten', es: 'Reiniciar' },
  backup: { en: 'Backup', fr: 'Sauvegarder', de: 'Backup', es: 'Copia' },
  refresh: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
};

const t = (text, language) => pick(text, language);
const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function message(text, language, withRefresh = false) {
  const components = [{ type: 'text', variant: 'body', text: t(text, language) }];
  if (withRefresh) {
    components.push(refreshButton(language));
  }
  return { ttl_seconds: withRefresh ? 60 : 300, components };
}

const refreshButton = (language) => ({
  type: 'button',
  label: t(TEXT.refresh, language),
  icon: 'refresh-cw',
  style: 'secondary',
  action: { key: REFRESH },
});

const running = (record) => record.stats?.running === true;
// Stopped after a crash, and not started since.
const crashed = (record) => !running(record) && record.pendingRestart === 'crash';

/** The state word and style of a server. */
function stateOf(record, language) {
  if (!record.stats) {
    return { value: t(TEXT.waiting, language), icon: 'clock', color: WIDGET_COLORS.NEUTRAL };
  }
  if (running(record)) {
    if (!record.stats.answering && record.server.countsPlayers) {
      return { value: t(TEXT.starting, language), icon: 'loader', color: WIDGET_COLORS.INFO };
    }
    return { value: t(TEXT.running, language), icon: 'check-circle', color: WIDGET_COLORS.SUCCESS };
  }
  if (crashed(record)) {
    return {
      value: t(TEXT.crashed, language),
      icon: 'alert-triangle',
      color: WIDGET_COLORS.DANGER,
    };
  }
  return { value: t(TEXT.stopped, language), icon: 'x-circle', color: WIDGET_COLORS.NEUTRAL };
}

/** The tile of one server: players online / slots while it answers, else its state. */
function serverTile(record, label, language) {
  const state = stateOf(record, language);
  const { stats } = record;
  if (running(record) && stats.answering && record.server.countsPlayers) {
    return {
      type: 'value',
      value: fit(stats.max > 0 ? `${stats.online}/${stats.max}` : String(stats.online), 12),
      label: fit(label, 24),
      icon: 'users',
      color: WIDGET_COLORS.SUCCESS,
    };
  }
  return { type: 'value', value: fit(state.value, 12), label: fit(label, 24), ...state };
}

/** The status row of one server: its state, with the version while running. */
function stateRow(record, language) {
  const state = stateOf(record, language);
  const version = running(record) ? record.stats.version : null;
  return {
    label: fit(record.server.name, 40),
    icon: state.icon,
    value: fit(version ? `${state.value} · ${version}` : state.value, 40),
    color: state.color,
  };
}

/** Who is playing on one server, as one row (null: not answering, or no players). */
function playersRow(record, label, language) {
  const { stats } = record;
  if (!running(record) || !stats.answering || !record.server.countsPlayers) {
    return null;
  }
  let value;
  if (stats.online === 0) {
    value = t(TEXT.nobody, language);
  } else if (stats.players && stats.players.length > 0) {
    const missing = stats.online - stats.players.length;
    value = stats.players.join(', ') + (missing > 0 ? ` +${missing}` : '');
  } else {
    value = String(stats.online);
  }
  return {
    label: fit(label, 40),
    icon: 'user',
    value: fit(value, 40),
    color: WIDGET_COLORS.NEUTRAL,
  };
}

/** The command buttons a server offers, most useful first. */
function commandsOf(record, single, allowStop) {
  const verbs = [];
  if (running(record)) {
    if (allowStop) {
      verbs.push(...(single ? ['restart', 'stop'] : ['stop']));
    }
  } else if (record.stats) {
    verbs.push('start');
  }
  if (single) {
    verbs.push('backup');
  }
  return verbs.map((verb) => ({ verb, record }));
}

async function get(hub, { settings, language = 'en' } = {}) {
  if (!hub.client) {
    return message(
      hub.config?.urlInvalid ? CONNECTION_TEXT.badUrl : CONNECTION_TEXT.missing,
      language,
    );
  }
  if (hub.error) {
    return message(ERROR_TEXT[hub.error.kind], language, true);
  }
  if (hub.records.size === 0) {
    return message(CONNECTION_TEXT.noServer, language, true);
  }
  const records = hub.view(settings?.device).slice(0, MAX_SERVERS);
  if (records.length === 0) {
    return message(TEXT.unknown, language);
  }
  const single = records.length === 1;
  const components = [];
  if (single) {
    const [record] = records;
    components.push(serverTile(record, record.server.name, language));
    if (running(record)) {
      components.push(
        {
          type: 'value',
          value: Math.round(record.stats.cpu),
          unit: '%',
          label: t(TEXT.cpu, language),
          icon: 'cpu',
        },
        {
          type: 'value',
          value: Math.round(record.stats.memoryBytes / (1024 * 1024)),
          unit: 'MB',
          label: t(TEXT.memory, language),
          icon: 'hard-drive',
        },
      );
    }
  } else {
    for (const record of records) {
      components.push(serverTile(record, record.server.name, language));
    }
  }

  const items = [];
  for (const record of records) {
    items.push(stateRow(record, language));
    const row = playersRow(
      record,
      single ? t(TEXT.players, language) : `${t(TEXT.players, language)} · ${record.server.name}`,
      language,
    );
    if (row) {
      items.push(row);
    }
  }
  components.push({ type: 'status', items: items.slice(0, MAX_ROWS) });

  // The device travels in the params; the key is unique (the core drops a
  // button whose key is taken).
  const commands = records
    .flatMap((record) => commandsOf(record, single, hub.config.allowStop))
    .slice(0, MAX_BUTTONS);
  commands.forEach(({ verb, record }, index) => {
    components.push({
      type: 'button',
      label: fit(
        single ? t(TEXT[verb], language) : `${t(TEXT[verb], language)} ${record.server.name}`,
        24,
      ),
      icon: { start: 'play', stop: 'square', restart: 'rotate-cw', backup: 'archive' }[verb],
      style: verb === 'stop' ? 'danger' : 'secondary',
      action: {
        key: `${verb}_${index + 1}`,
        params: { device: deviceIds(hub.gladys, record.server.id).device },
        confirm: true,
      },
    });
  });
  components.push(refreshButton(language));

  // A server starting or stopping moves: refresh sooner.
  const moving = records.some(
    (record) => record.stats && running(record) && !record.stats.answering,
  );
  return { ttl_seconds: moving ? 20 : 60, components };
}

async function action(hub, { actionKey, params = {} }) {
  if (actionKey === REFRESH) {
    await hub.pollAll();
    return hub.error ? ERROR_TEXT[hub.error.kind] : ACTION_TEXT.refreshed;
  }
  const match = /^(start|stop|restart|backup)_\d{1,2}$/u.exec(actionKey ?? '');
  if (!match || typeof params.device !== 'string') {
    throw new Error(`Unknown action ${actionKey}`);
  }
  // The rules (stop allowed?) are checked again here: the content may predate a change.
  const { message: text } = await hub.command(params.device, VERBS[match[1]]);
  return text;
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};
