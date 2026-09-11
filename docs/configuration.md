# Configuration

Variables du serveur :

```env
NODE_ENV=production
MCP_HOST=127.0.0.1
MCP_PORT=3210
MCP_BEARER_TOKEN=replace-with-a-long-random-secret
FOUNDRY_BRIDGE_SECRET=replace-with-a-different-secret
TARGET_WORLD_ID=my-world
FOUNDRY_ORIGIN=https://foundry.example.com
AUDIT_LOG_PATH=./data/audit.jsonl
LOG_LEVEL=info
```

Le serveur doit être placé derrière HTTPS/WSS lorsqu’il est accessible hors de la machine locale. Le réglage du module Foundry contient l’URL WSS et le secret du pont, jamais le jeton MCP.
