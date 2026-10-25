import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig, parseUrl } from '../src/config.js';

test('an empty configuration: nothing to read, the defaults of the manifest', () => {
  assert.deepEqual(normalizeConfig(), {
    url: null,
    urlInvalid: false,
    token: '',
    insecure: true,
    allowStop: false,
    pollIntervalMs: 30_000,
    language: 'fr',
  });
  assert.equal(DEFAULT_CONFIG.allow_stop, false);
});

test('the address: a bare host gets https and the port of Crafty, a path is dropped', () => {
  assert.equal(parseUrl('192.168.1.10'), 'https://192.168.1.10:8443');
  assert.equal(parseUrl(' crafty.lan:9443 '), 'https://crafty.lan:9443');
  assert.equal(
    parseUrl('https://crafty.example.com/panel/dashboard'),
    'https://crafty.example.com',
  );
  assert.equal(parseUrl('http://192.168.1.10:8000'), 'http://192.168.1.10:8000');
  assert.equal(parseUrl('https://[fd00::10]:8443'), 'https://[fd00::10]:8443');
  for (const bad of ['', 'ftp://crafty', 'https://user:pass@crafty', 'http://']) {
    assert.equal(parseUrl(bad), null, bad);
  }
});

test('form values: booleans as strings, an unknown interval or language falls back', () => {
  const config = normalizeConfig({
    url: 'nope://',
    api_token: '  token-with-blanks  ',
    allow_self_signed: 'false',
    allow_stop: 'true',
    poll_interval: '7',
    language: 'it',
  });
  assert.equal(config.urlInvalid, true);
  assert.equal(config.token, 'token-with-blanks');
  assert.equal(config.insecure, false);
  assert.equal(config.allowStop, true);
  assert.equal(config.pollIntervalMs, 30_000);
  assert.equal(config.language, 'fr');
  assert.equal(normalizeConfig({ poll_interval: '300' }).pollIntervalMs, 300_000);
});
