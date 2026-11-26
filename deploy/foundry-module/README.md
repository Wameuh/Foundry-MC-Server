# Installation du module Foundry

## Archive de release

Dans **Configuration et installation → Modules complémentaires → Installer un
module**, utiliser l'URL de manifeste publiée par le dépôt ou héberger le
`module.json` accompagné de l'archive ZIP produite par `npm run package:module`.
Le manifeste référence `foundry-mcp.js`, `styles/agentcontrol.css` et les
fichiers de langue, tous inclus dans l'archive.

## Build local

```sh
npm ci
npm run package:module
MODULE_VERSION="$(node -p "require('./apps/foundry-module/module.json').version")"
unzip -l "artifacts/foundry-mcp-bridge-${MODULE_VERSION}.zip"
```

Installer ensuite le contenu du ZIP comme module Foundry (ou publier ce ZIP et
le manifeste), activer `Foundry MCP Agent` dans le monde, puis renseigner dans
ses settings :

- **Control channel WebSocket URL** : `wss://mcp.example.com/foundry-mcp/bridge` (ou `ws://` sur LAN/HTTP de confiance) ;
- **Control channel secret** : la valeur de `FOUNDRY_BRIDGE_SECRET` du serveur.

Le navigateur GM ne sert plus qu'au canal de contrôle : provisioning initial du
compte technique et panneau AgentControl A/B. Toutes les opérations documentaires
sont exécutées par le backend Socket.IO direct ; aucune session Chromium headless
n'est requise.
