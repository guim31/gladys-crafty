# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-10-25

### Added

- One device per server of Crafty Controller 4: Running, Players online,
  Player slots, Players (who is playing), CPU, Memory, Version.
- Scene triggers: a player joined or left the Minecraft server (with the
  name, and the minutes played), the server is empty, is full, stopped
  unexpectedly, restarted.
- Scene actions: start, stop, restart and back up a server (stop and restart
  only once allowed in the configuration), read a server for the next steps
  of a scene.
- Dashboard widget "Crafty servers": a tile per server, its state and who is
  playing, Start, Stop, Restart and Backup buttons confirmed before running.
- "Test the connection" button, self-signed certificates accepted by default
  (the default HTTPS of Crafty), English, French, German and Spanish texts
  and documentation.

[Unreleased]: https://github.com/guim31/gladys-crafty/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-crafty/releases/tag/v1.0.0
