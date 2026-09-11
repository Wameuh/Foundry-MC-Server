# Installation

L'installation comporte trois éléments indépendants : le module Foundry, le
serveur MCP et le client agent. Installer le module ne lance pas le serveur MCP.

## 1. Installer le module dans Foundry

Cette méthode ne nécessite ni Node.js ni npm sur la machine Foundry.

Dans l'écran **Configuration et installation** de Foundry :

1. ouvrir **Modules complémentaires** ;
2. cliquer sur **Installer un module** ;
3. coller cette URL dans **URL du manifeste** :

```text
https://raw.githubusercontent.com/Wameuh/Foundry-MC-Server/main/apps/foundry-module/module.json
```

4. cliquer sur **Installer** ;
5. ouvrir le monde D&D5e et activer **Foundry MCP Bridge** dans la gestion des modules.

Cette URL utilise la dernière version publiée dans la branche `main`.
Le manifeste télécharge automatiquement l'archive correspondante. Pour une
installation locale avant la première release, voir « Archive locale » plus bas.

## 2. Installer le serveur MCP avec Docker

Prérequis : Git, Docker et le module Compose de Docker.

```sh
git clone https://github.com/Wameuh/Foundry-MC-Server.git
cd Foundry-MC-Server
cp .env.example .env
sed -i "s|replace-with-a-long-random-secret|$(openssl rand -hex 32)|" .env
sed -i "s|replace-with-a-different-long-random-secret|$(openssl rand -hex 32)|" .env
```

Configurer les adresses et l'identifiant technique du monde :

```sh
export FOUNDRY_WORLD_ID="monde-foundry"
export FOUNDRY_PUBLIC_URL="https://foundry.example.com"
export MCP_PUBLIC_HOST="mcp.example.com"

sed -i "s|TARGET_WORLD_ID=my-world|TARGET_WORLD_ID=${FOUNDRY_WORLD_ID}|" .env
sed -i "s|FOUNDRY_ORIGIN=https://foundry.example.com|FOUNDRY_ORIGIN=${FOUNDRY_PUBLIC_URL}|" .env
sed -i "s|MCP_ALLOWED_HOSTS=mcp.example.com,localhost,127.0.0.1|MCP_ALLOWED_HOSTS=${MCP_PUBLIC_HOST},localhost,127.0.0.1|" .env
```

Construire et démarrer le service :

```sh
mkdir -p data
docker compose -f deploy/compose.example.yaml up -d --build
docker compose -f deploy/compose.example.yaml ps
curl --fail http://127.0.0.1:3210/health
```

Afficher les journaux en cas de problème :

```sh
docker compose -f deploy/compose.example.yaml logs --tail=100 foundry-mcp
```

Le port `3210` reste lié à `127.0.0.1`. Configurer ensuite le reverse proxy
HTTPS/WSS avec l'exemple `deploy/nginx/foundry-mcp.example.conf`.

## 3. Configurer la session Foundry

Pour une session GM automatique exécutée par le serveur MCP, suivre les
commandes de [Session Foundry GM automatique](headless-foundry.md). C'est le
mode recommandé lorsque Foundry et le serveur MCP partagent la même machine.
Après l'installation ou la mise à jour du module, recharger le monde avec un
GM complet, confirmer **Créer l'assistant**, puis conserver le bloc `.env`
affiché avant de fermer la fenêtre.

Pour conserver une session GM ouverte manuellement, configurer le module comme
suit.

### Session manuelle

Dans **Configuration du jeu → Configurer les paramètres → Paramètres du module**,
renseigner :

```text
URL WebSocket du pont : wss://mcp.example.com/foundry-mcp/bridge
Secret du pont          : valeur FOUNDRY_BRIDGE_SECRET du fichier .env
```

Après avoir enregistré les paramètres, le pont se connecte ou se reconnecte
automatiquement : aucun rechargement du monde n'est nécessaire. Un navigateur
connecté avec un utilisateur GM doit rester ouvert : c'est lui qui exécute les
API Foundry, D&D5e et Plutonium. Un rechargement reste nécessaire uniquement
après l'installation ou la mise à jour du module lui-même.

Vérifier alors l'état public du serveur :

```sh
curl --fail https://mcp.example.com/health
```

## 4. Connecter Codex CLI

Sur la machine où Codex CLI est installé :

```sh
export MCP_BEARER_TOKEN="copier-la-valeur-MCP_BEARER_TOKEN-du-serveur"
codex mcp add foundry \
  --url https://mcp.example.com/mcp \
  --bearer-token-env-var MCP_BEARER_TOKEN
codex mcp list
```

Lancer ensuite Codex et utiliser `/mcp` pour vérifier que `foundry` est actif.
La configuration détaillée se trouve dans `docs/codex-cli.md`.

## Archive locale du module, réservée au développement

Cette procédure sert uniquement lorsque la release GitHub n'est pas encore
publiée ou pour tester une modification locale :

```sh
npm ci
npm run package:module
unzip -l artifacts/foundry-mcp-bridge-0.2.0.zip
```

Extraire ensuite l'archive dans le répertoire de données Foundry :

```sh
mkdir -p /chemin/vers/FoundryVTT/Data/modules/foundry-mcp-bridge
unzip artifacts/foundry-mcp-bridge-0.2.0.zip \
  -d /chemin/vers/FoundryVTT/Data/modules/foundry-mcp-bridge
```

Redémarrer Foundry, puis activer le module dans le monde.

Plutonium reste facultatif. La matrice certifiée est Foundry `14.367`, D&D5e
`5.3.3` et Plutonium `2.18.1.v14`.
