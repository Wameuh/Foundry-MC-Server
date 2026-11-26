# Sécurité

- `MCP_BEARER_TOKEN` authentifie les clients MCP sur `/mcp`.
- `FOUNDRY_BRIDGE_SECRET` authentifie le navigateur GM par HMAC sur le websocket
  de contrôle ; ce canal ne permet ni requête documentaire ni RPC brute.
- Le token du daemon AgentControl n'est jamais envoyé au module ni journalisé.
  Les seules sessions contrôlables sont celles persistées dans le mapping des
  slots A/B du monde configuré.
- Les credentials du compte technique Foundry sont stockés côté serveur dans
  `FOUNDRY_DIRECT_CREDENTIALS_PATH` avec permissions restrictives.
- Le catalogue Plutonium est lu depuis des fichiers locaux ; Plutonium n'est pas
  exécuté dans un navigateur par le serveur.
- Les suppressions passent par confirmation et les écritures sont auditées dans
  `AUDIT_LOG_PATH`.
