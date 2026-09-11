# Installation du module Foundry

## Depuis l'interface Foundry

Dans **Configuration et installation → Modules complémentaires → Installer un
module**, utiliser cette URL de manifeste :

```text
https://raw.githubusercontent.com/Wameuh/Foundry-MC-Server/main/apps/foundry-module/module.json
```

Il n'est pas nécessaire d'exécuter npm : Foundry lit le manifeste puis
télécharge l'archive publiée dans la release GitHub.

Activer ensuite `Foundry MCP Bridge` dans le monde et renseigner :

```text
wss://mcp.example.com/foundry-mcp/bridge
```

Le secret doit être identique à `FOUNDRY_BRIDGE_SECRET` sur le serveur MCP.

## Construction locale

Uniquement pour développer ou tester avant publication :

```sh
npm ci
npm run package:module
MODULE_VERSION="$(node -p "require('./apps/foundry-module/module.json').version")"
unzip -l "artifacts/foundry-mcp-bridge-${MODULE_VERSION}.zip"
```

Une session de navigateur GM doit rester active : elle peut être ouverte
manuellement ou supervisée automatiquement par le serveur MCP. Cette session
exécute les API Foundry et Plutonium ; le serveur MCP seul ne peut pas manipuler
le monde.
