# Crafty Controller for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) integration for
[Crafty Controller](https://craftycontrol.com), the self-hosted panel for
Minecraft servers: follow each server (running, players, CPU, memory,
version), react to players and crashes, and start, stop, restart or back up a
server from a scene or the dashboard.

> **Tested against a real Crafty Controller 4.11** (see
> [what was checked](#checked-on-a-real-crafty-and-what-was-not)), not yet
> inside a real Gladys: feedback welcome.

## Features

- **One device per Crafty server**: Running, Players online, Player slots,
  Players (who is playing), CPU, Memory, Version.
- **Scene triggers**: a player joined (with the name), a player left (with
  the minutes played), the server is empty, is full, stopped unexpectedly,
  restarted.
- **Scene actions**: start, stop, restart, back up a server (stop and
  restart only once allowed in the configuration), read a server for the
  next steps of a scene.
- **Dashboard widget** "Crafty servers": a tile per server, its state and who
  is playing, Start / Stop / Restart / Backup buttons, each confirmed first.
- **Test the connection** button: one line per server.
- Every text in English, French, German and Spanish.

## Requirements

- Gladys Assistant 5.1.0 or later.
- Crafty Controller 4 (checked on 4.11) reachable from Gladys, and an API
  token of a Crafty user (Panel Config → Users → API Keys → Get A Token).

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-crafty`.
2. In **Configuration**, enter the address of Crafty
   (`https://192.168.1.10:8443`) and the API token, then click **Test the
   connection**.
3. Open the **Discover** tab and add the servers.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

The container reads Crafty on its own timer (30 seconds by default,
`should_poll: false`: Gladys never polls): `GET /api/v2/servers`, then
`GET /api/v2/servers/<id>/stats` for each server — the statistics Crafty
records every 30 seconds. States go to Gladys only when they change (and
every 6 hours, so Gladys never shows them as stale), and only to the devices
the user added; the scene events and the widget work for every server.

Joins and leaves come from the names of the Minecraft status ping (12 at
most), else from the counts. A stop not asked from Gladys is a crash when
Crafty flags it (its crash detection) or when the server's log file
(`GET /api/v2/servers/<id>/logs?file=true`) has no clean shutdown line
("Stopping server"); the log is never kept nor logged. Commands are
`POST /api/v2/servers/<id>/action/<start|stop|restart|backup>_server`, the
backup with the default backup configuration of the server.

## Checked on a real Crafty, and what was not

Checked on 25 October 2026 against **Crafty Controller 4.11.0**
(`registry.gitlab.com/crafty-controller/crafty-4`) in Docker, with a real
**Paper 1.21.4** server created through the API:

- the answers of the API recorded as fixtures (`test/fixtures/crafty`):
  server list, statistics while importing, starting, running empty, with two
  real players (headless [mineflayer](https://github.com/PrismarineJS/mineflayer)
  clients), stopped; backups; the log after a clean stop and after the Java
  process was killed; the refusals of a bad token and of a token without
  rights;
- the start, stop, restart and backup commands, sent by the integration;
- the integration itself in its Docker image, with the constraints of the
  Gladys sandbox (`--cap-drop ALL`, `--security-opt no-new-privileges`,
  `--read-only`, `--memory 256m`, `--pids-limit 256`, bridge network), against
  that Crafty (`test/real/real-crafty.test.js`, with the SDK's fake Gladys).

Not checked: a real Gladys instance (dashboard rendering, scenes), a Bedrock
server, Crafty's own crash detection, servers of other kinds (Steam, Hytale).

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
CRAFTY_URL=https://… CRAFTY_TOKEN=… CRAFTY_SERVER=<server id> npm run test:real
```

`npm run test:real` drives a real Crafty: it starts, restarts and stops the
given server. Project rules: [`CLAUDE.md`](CLAUDE.md).

## Credits and license

Built on the official
[integration template](https://github.com/GladysAssistant/integration-template-js)
and the [Gladys integration SDK](https://github.com/GladysAssistant/integration-sdk-js).
Crafty Controller is developed by Arcadia Technology (GPL-3.0); this
integration only talks to its public API. Not affiliated with Crafty
Controller, Arcadia Technology nor Mojang. Minecraft is a trademark of Mojang
Synergies AB. The cover shows the official Crafty Controller logo
(`app/frontend/static/assets/images/logo_long.png` of the
[Crafty 4 repository](https://gitlab.com/crafty-controller/crafty-4), GPL-3.0).

Licensed under the [Apache License 2.0](LICENSE).
