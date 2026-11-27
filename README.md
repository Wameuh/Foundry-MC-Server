# Foundry MCP

Backend MCP pour administrer un monde Foundry VTT 14 **sans exécuter les
opérations dans un navigateur**. Le service Node se connecte directement à
Foundry en Socket.IO avec un compte technique, expose des outils MCP sûrs,
indexe les données locales Plutonium/5etools et fournit au module Foundry un
canal de contrôle limité au provisioning et au panneau AgentControl A/B.

L'ancien pont opérationnel navigateur et le navigateur Chromium headless ont
été supprimés. Le websocket `/foundry-mcp/bridge` reste uniquement un canal de
contrôle authentifié : il ne transporte plus les requêtes documentaires.

## Architecture

```text
Client MCP ── bearer token ──> foundry-mcp-server ── Socket.IO direct ──> Foundry VTT
                                   │
                                   ├── compte technique provisionné automatiquement
                                   ├── audit + confirmations de suppression
                                   ├── catalogue local Plutonium/5etools
                                   └── proxy AgentControl scopé slots A/B
                                             │
Foundry module (navigateur GM) ── websocket contrôle HMAC ──┘
```

Le module Foundry ne fait plus que :

- proposer puis transmettre le provisioning initial du compte technique ;
- afficher le panneau AgentControl Agent A / Agent B ;
- maintenir l'authentification et la reconnexion du canal de contrôle.

Le token du daemon AgentControl reste exclusivement côté serveur. Les agents A/B
ne peuvent être pilotés que s'ils sont enregistrés dans le mapping de slots du
monde configuré.

## Prérequis

- Node.js 22+ ;
- Foundry VTT 14.x (cible validée : 14.370) ;
- système dnd5e 6.x (cible validée : 6.1.1) ;
- Plutonium installé dans Foundry si l'import de contenu local est utilisé
  (cible validée : 2.20.4.v14) ;
- `agentcontrol-daemon` joignable en TCP sur la même machine si le panneau
  AgentControl est utilisé.

## Configuration serveur

Copier `.env.example` vers `.env`, ne jamais committer `.env`, puis définir au
minimum :

```sh
MCP_BEARER_TOKEN=<secret long pour les clients MCP>
FOUNDRY_BRIDGE_SECRET=<autre secret long pour le canal de contrôle>
TARGET_WORLD_ID=<id du monde Foundry>
FOUNDRY_ORIGIN=https://foundry.example.com
FOUNDRY_DIRECT_URL=http://127.0.0.1:30000
```

Variables principales :

| Variable | Rôle |
| --- | --- |
| `MCP_HOST`, `MCP_PORT`, `MCP_ALLOWED_HOSTS` | écoute HTTP/MCP et hôtes autorisés |
| `MCP_BEARER_TOKEN` | bearer token des clients MCP sur `/mcp` |
| `FOUNDRY_BRIDGE_SECRET` | secret HMAC du websocket de contrôle navigateur |
| `TARGET_WORLD_ID` | monde unique auquel cette instance est scopée |
| `FOUNDRY_ORIGIN` | origine publique Foundry, utilisée pour les protections websocket |
| `FOUNDRY_DIRECT_URL` | URL interne Foundry pour la connexion Socket.IO directe ; défaut `FOUNDRY_ORIGIN` |
| `FOUNDRY_DIRECT_CREDENTIALS_PATH` | fichier JSON 0600 contenant les credentials du compte technique |
| `AGENTCONTROL_TCP` | adresse TCP du daemon AgentControl, défaut `127.0.0.1:7331` |
| `AGENTCONTROL_TOKEN_PATH` | chemin du token daemon si différent de `/config/.agentcontrol/daemon.token` |
| `AGENTCONTROL_WORKSPACE` | workspace dédié aux agents A/B, défaut `/data/agent-workspace` |
| `AGENTCONTROL_SLOTS_PATH` | persistance du mapping monde/slots, défaut `./data/agentcontrol-slots.json` |
| `PLUTONIUM_DATA_PATH` | répertoire local des JSON Plutonium/5etools à indexer |
| `AUDIT_LOG_PATH`, `LOG_LEVEL` | audit JSONL et verbosité |
| `NORMAL_OPERATION_TIMEOUT_MS` | timeout des opérations directes Foundry |
| `BRIDGE_HEARTBEAT_TIMEOUT_MS` | timeout du canal de contrôle navigateur |
| `DELETE_CONFIRMATION_TTL_MS` | durée de validité des confirmations de suppression |
| `MAX_JSON_BODY_BYTES` | taille maximale des messages HTTP/websocket |

## Déploiement sur un serveur Foundry existant

Exemple pour Foundry 14.370 + dnd5e 6.1.1 + Plutonium, avec le daemon
AgentControl sur la même machine :

1. **Installer ou build le module Foundry**

   ```sh
   npm ci
   npm run package:module
   ```

   L'archive est produite dans `artifacts/foundry-mcp-bridge-<version>.zip` avec
   `module.json`, `foundry-mcp.js`, `styles/agentcontrol.css` et `lang/`.
   Publier cette archive et le manifeste, ou copier le contenu dans
   `Data/modules/foundry-mcp-bridge`, puis activer le module dans le monde.

2. **Configurer le module dans le monde** en tant que GM :

   - Bridge URL : `wss://mcp.example.com/foundry-mcp/bridge` (ou `ws://` en LAN/HTTP) ;
   - Bridge secret : exactement `FOUNDRY_BRIDGE_SECRET`.

3. **Configurer et démarrer le serveur MCP** :

   ```sh
   cp .env.example .env
   # éditer secrets, TARGET_WORLD_ID, FOUNDRY_ORIGIN, FOUNDRY_DIRECT_URL
   npm ci
   npm run build
   cd apps/mcp-server
   node dist/index.js
   ```

   ou avec Docker :

   ```sh
   cp .env.example .env
   docker compose -f deploy/compose.example.yaml up --build
   ```

   Adapter dans `.env`/compose :

   ```sh
   AGENTCONTROL_TCP=host.docker.internal:7331        # depuis Docker
   AGENTCONTROL_TOKEN_PATH=/run/secrets/agentcontrol-daemon.token
   PLUTONIUM_DATA_PATH=/plutonium-data              # chemin dans le conteneur
   ```

   Le compose monte le token daemon et le répertoire Plutonium en lecture seule ;
   ajuster les chemins hôtes selon l'installation.

4. **Provisionner le compte technique** : au premier contrôle depuis le module,
   Foundry propose la création du compte GM technique. Après confirmation, le
   module transmet une fois le credential au serveur via le canal chiffré/authentifié ;
   le serveur le conserve dans `FOUNDRY_DIRECT_CREDENTIALS_PATH` et l'utilise pour
   sa connexion directe permanente. Une fois le provisioning fait, le navigateur
   n'est plus nécessaire aux opérations documentaires.

5. **Vérifier** :

   ```sh
   curl http://127.0.0.1:3210/health
   curl -H "Authorization: Bearer $MCP_BEARER_TOKEN" http://127.0.0.1:3210/mcp
   ```

   Le tool `foundry_get_status` doit indiquer l'état du backend direct. Les outils
   `content_search`, `content_get`, `content_import_preview` et
   `content_import_commit` utilisent `PLUTONIUM_DATA_PATH` sans exécuter Plutonium
   dans un navigateur.

## AgentControl A/B

Le panneau du module crée deux sessions daemon scopées au monde, avec workspace
`AGENTCONTROL_WORKSPACE/<worldId>`. Les actions disponibles sont prompt, steer,
cancel, clear, compact, permissions/questions, choix du modèle/mode et état des
slots. Le serveur ne proxy ni terminal, ni filesystem, ni RPC brute, ni sessions
hors mapping. `destroySlot` met la session en sommeil plutôt que de la supprimer.

Le daemon AgentControl ignore les champs `mcpServers` à la création de session ;
l’accès aux outils Foundry des agents doit donc être configuré au niveau workspace/agent,
pas injecté par le RPC `new_session`.

## Développement

```sh
npm ci
npm run build -w @foundry-mcp/protocol
npm run typecheck
npm test
npm run package:module
```

`npm run check` ajoute lint et vérification des manifestes. Les règles agents
sont dans [`agent_rules.md`](agent_rules.md). La documentation détaillée reste
dans `docs/`, mais le présent README est la référence pour l'architecture
backend-direct.
