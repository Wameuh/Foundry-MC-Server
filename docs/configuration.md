# Configuration

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

Vérifier les noms des variables sans afficher leurs secrets :

```sh
sed -E 's/^(MCP_BEARER_TOKEN|FOUNDRY_BRIDGE_SECRET)=.*/\1=<masqué>/' .env
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
