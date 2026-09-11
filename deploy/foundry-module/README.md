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
unzip -l artifacts/foundry-mcp-bridge-0.1.1.zip
```

Le navigateur GM doit rester ouvert et connecté : il exécute les API Foundry
et Plutonium. Le serveur MCP seul ne peut pas manipuler le monde.
