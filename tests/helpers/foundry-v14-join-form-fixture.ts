/**
 * Minimal Foundry VTT 14 ApplicationV2 join form fixture.
 * Observed on Foundry 14.364 (`id="join-game-form"`); certified target is 14.367.
 */
export const FOUNDRY_V14_JOIN_GAME_FORM_FIXTURE = `
<form class="application standard-form framed" data-application-part="form" id="join-game-form">
  <select name="userid">
    <option value=""></option>
    <option value="gm-id" disabled>Gamemaster</option>
    <option value="mcp-id">MCP Bridge GM</option>
  </select>
  <input type="password" name="password" value="">
  <button type="submit" name="join">Join Game Session</button>
</form>
`.trim();
