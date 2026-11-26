# Configuration

Les variables supportées sont définies dans `apps/mcp-server/src/config.ts` et
documentées dans `.env.example` ainsi que dans le tableau du README racine.

Les variables headless/Chromium (`FOUNDRY_HEADLESS_*`) et le routage de requêtes
opérationnelles vers le navigateur ont été supprimés. Il n'existe pas de
variable `BRIDGE_TOKEN` : le canal de contrôle utilise `FOUNDRY_BRIDGE_SECRET`,
indépendant de `MCP_BEARER_TOKEN`.

Pour Docker, monter le token AgentControl en lecture seule et configurer
`AGENTCONTROL_TCP=host.docker.internal:7331` lorsque le daemon est sur l'hôte.
Monter également le répertoire Plutonium en lecture seule si
`PLUTONIUM_DATA_PATH` est utilisé.
