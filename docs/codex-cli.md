# Codex CLI

Codex utilise le transport MCP Streamable HTTP du serveur. Le jeton reste dans
une variable d'environnement et n'est pas écrit directement dans `config.toml`.

## Ajouter le serveur sur le même hôte

Lorsque Codex, le serveur MCP et Foundry s'exécutent sur le même hôte — y
compris avec Codex Desktop connecté à un projet distant — utiliser l'adresse
locale :

```sh
export MCP_BEARER_TOKEN="copier-la-valeur-MCP_BEARER_TOKEN-du-serveur"
codex mcp add foundry \
  --url http://127.0.0.1:3210/mcp \
  --bearer-token-env-var MCP_BEARER_TOKEN
codex mcp list
```

Utiliser `https://mcp.example.com/mcp` à la place uniquement lorsque le client
Codex se trouve sur une autre machine et que le reverse proxy HTTPS a été
configuré.

Pour rendre la variable disponible dans les prochaines sessions, l'ajouter au
gestionnaire de secrets ou au mécanisme d'environnement utilisé pour lancer
Codex. Ne pas écrire le jeton dans le dépôt.

## Configuration TOML équivalente

Le fichier global est `~/.codex/config.toml`. Une configuration propre au
projet peut aussi être placée dans `.codex/config.toml` pour un projet approuvé.

```toml
[mcp_servers.foundry]
url = "http://127.0.0.1:3210/mcp"
bearer_token_env_var = "MCP_BEARER_TOKEN"
tool_timeout_sec = 180
required = true
```

Après modification, redémarrer Codex. Dans l'interface en terminal, exécuter
`/mcp` pour voir les serveurs actifs.

Référence : [documentation MCP officielle de Codex](https://developers.openai.com/codex/mcp/).
