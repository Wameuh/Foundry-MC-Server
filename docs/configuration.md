# Configuration

## Règles transmises aux agents

Le fichier `agent_rules.md`, à la racine du dépôt, est la source unique des
règles opérationnelles Foundry. Il peut être amendé lorsqu’une erreur ou une
bonne pratique est découverte.

À chaque nouvelle connexion MCP, le serveur relit le fichier et place son
contenu complet dans les instructions de connexion. Il l’expose également :

- comme ressource MCP `foundry://agent-rules` ;
- comme outil en lecture seule `foundry_get_agent_rules`.

La ressource et l’outil relisent le fichier à chaque appel. Un agent déjà
connecté peut donc récupérer une modification sans redémarrer le serveur en
appelant l’outil. En revanche, ses instructions initiales ne changent qu’après
une nouvelle connexion.

Avec le Compose fourni, le fichier hôte est monté en lecture seule dans le
conteneur. Après une modification, aucune reconstruction de l’image n’est
nécessaire. Le fichier est une configuration privilégiée : seuls les
administrateurs du serveur doivent pouvoir le modifier, car son contenu est
présenté aux agents comme une instruction.

Le serveur refuse un fichier vide ou supérieur à 128 Kio. Les protections
critiques restent imposées par les schémas et le code du serveur ; le Markdown
ne remplace pas la confirmation des suppressions, les permissions GM ou la
validation des Documents.

## Créer le fichier `.env`

Depuis la racine du dépôt :

```sh
cp .env.example .env
sed -i "s|replace-with-a-long-random-secret|$(openssl rand -hex 32)|" .env
sed -i "s|replace-with-a-different-long-random-secret|$(openssl rand -hex 32)|" .env
```

Renseigner ensuite les valeurs propres au déploiement :

```sh
export FOUNDRY_WORLD_ID="monde-foundry"
export FOUNDRY_PUBLIC_URL="https://foundry.example.com"
export MCP_PUBLIC_HOST="mcp.example.com"

sed -i "s|TARGET_WORLD_ID=my-world|TARGET_WORLD_ID=${FOUNDRY_WORLD_ID}|" .env
sed -i "s|FOUNDRY_ORIGIN=https://foundry.example.com|FOUNDRY_ORIGIN=${FOUNDRY_PUBLIC_URL}|" .env
sed -i "s|MCP_ALLOWED_HOSTS=mcp.example.com,localhost,127.0.0.1|MCP_ALLOWED_HOSTS=${MCP_PUBLIC_HOST},localhost,127.0.0.1|" .env
```

Vérifier la syntaxe Compose sans afficher la configuration résolue ni les
secrets :

```sh
docker compose -f deploy/compose.example.yaml config --quiet
```

## Variables du serveur

```env
NODE_ENV=production
MCP_HOST=127.0.0.1
MCP_PORT=3210
MCP_ALLOWED_HOSTS=mcp.example.com,localhost,127.0.0.1
MCP_BEARER_TOKEN=replace-with-a-long-random-secret
FOUNDRY_BRIDGE_SECRET=replace-with-a-different-long-random-secret
TARGET_WORLD_ID=my-world
FOUNDRY_ORIGIN=https://foundry.example.com
AUDIT_LOG_PATH=./data/audit.jsonl
LOG_LEVEL=info
```

`MCP_ALLOWED_HOSTS` est obligatoire lorsque le serveur écoute sur `0.0.0.0`,
comme dans le conteneur Docker. Il contient les noms d'hôte HTTP acceptés, sans
protocole.

Le serveur doit être placé derrière HTTPS/WSS lorsqu'il est accessible hors de
la machine locale. Le réglage du module Foundry contient l'URL WSS et le secret
du pont, jamais le jeton MCP.

## Session Foundry automatique

Lorsque Foundry et le serveur MCP partagent la même machine, le serveur peut
superviser un Chromium headless et réauthentifier le compte `MCP Bridge GM`.
Les variables, commandes Docker et états de diagnostic sont détaillés dans
[Session Foundry GM automatique](headless-foundry.md). Le chargement du monde
dispose par défaut de cinq minutes, réglables avec
`FOUNDRY_HEADLESS_READY_TIMEOUT_MS`. Après que Foundry signale le monde comme
prêt, le serveur accorde trois minutes supplémentaires au module pour établir
le pont (`FOUNDRY_HEADLESS_BRIDGE_GRACE_MS`). Ce délai couvre notamment le hook
`ready` asynchrone de Plutonium.
