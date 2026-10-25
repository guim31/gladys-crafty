// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// Start, stop, restart or back up a server (stop and restart only when the
// configuration allows them: they throw the players out), and read a server
// now, its state going to the next actions of the scene ("{{1.0.players}} on
// the server") or to a "Continue only if" condition on `running`.
//
// The server is chosen among the devices of the integration. A command is
// queued by Crafty: `sent` tells whether one was sent (false when the server
// already was in the asked state).
// -----------------------------------------------------------------------------

import { ACTIONS } from './crafty/client.js';

const command = (action) =>
  async function run(hub, { fields = {} }) {
    const { sent } = await hub.command(fields.device || null, action);
    return { sent };
  };

export const SCENE_ACTIONS = {
  start_server: command(ACTIONS.START),
  stop_server: command(ACTIONS.STOP),
  restart_server: command(ACTIONS.RESTART),
  backup_server: command(ACTIONS.BACKUP),
  async read_server(hub, { fields = {} }) {
    return hub.readForScene(fields.device || null);
  },
};
