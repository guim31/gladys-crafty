# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration holds and where:

- **The API token of Crafty**, a secret field of its configuration, kept by
  Gladys and given to the container at start. It acts with the rights of its
  Crafty user: prefer a key limited to the servers and rights Gladys needs
  (Commands, Logs). It is only sent to the address configured, never
  logged, and redirects are not followed.
- **Nothing in `/data`**: the integration keeps no file; what it knows of the
  servers (states, players) lives in memory.
- **Network**: only the address of Crafty configured by the user (HTTPS by
  default, self-signed certificates accepted unless unticked). The log files
  of the servers are read to tell a crash from a clean stop, never kept nor
  logged (they hold the addresses of the players).
- **Commands**: start and backup are always allowed; stop and restart only
  once ticked in the configuration, and the widget asks for a confirmation
  before each command.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and Crafty Controller and the game servers the integration talks to.
