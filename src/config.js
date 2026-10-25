// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Reading intervals offered in the configuration, in seconds. Crafty records
// the statistics of its servers every 30 s by default: reading more often
// shows nothing new.
export const POLL_INTERVALS = ['30', '60', '120', '300'];

export const DEFAULT_PORT = 8443;

export const DEFAULT_CONFIG = {
  url: '',
  api_token: '',
  allow_self_signed: true,
  allow_stop: false,
  poll_interval: '30',
  language: 'fr',
};

/**
 * The address typed by the user, as a base URL; null when not understood.
 * A bare host gets https:// and the port of Crafty (8443).
 */
export function parseUrl(typed) {
  const value = typeof typed === 'string' ? typed.trim() : '';
  if (!value) {
    return null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//iu.test(value) ? value : `https://${value}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  if (url.username || url.password) {
    return null; // credentials belong in the token field, never in an address
  }
  if (!url.port && !/^[a-z][a-z0-9+.-]*:\/\//iu.test(value)) {
    url.port = String(DEFAULT_PORT);
  }
  // The API lives at /api/v2 of the panel: a path typed by habit is dropped.
  return `${url.protocol}//${url.host}`;
}

const bool = (value, fallback) => {
  if (value === true || value === 'true') {
    return true;
  }
  if (value === false || value === 'false') {
    return false;
  }
  return fallback;
};

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const typedUrl = typeof source.url === 'string' ? source.url.trim() : '';
  const url = parseUrl(typedUrl);
  // A token is kept as typed, without its surrounding blanks (a copy-paste).
  const token = typeof source.api_token === 'string' ? source.api_token.trim() : '';
  const interval = String(source.poll_interval ?? '');
  return {
    url,
    urlInvalid: typedUrl !== '' && url === null,
    token,
    insecure: bool(source.allow_self_signed, DEFAULT_CONFIG.allow_self_signed),
    allowStop: bool(source.allow_stop, DEFAULT_CONFIG.allow_stop),
    pollIntervalMs:
      Number(POLL_INTERVALS.includes(interval) ? interval : DEFAULT_CONFIG.poll_interval) * 1000,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
