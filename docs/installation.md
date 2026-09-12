# Installation

L'installation comporte trois éléments indépendants : le module Foundry, le
serveur MCP et le client agent. Installer le module ne lance pas le serveur MCP.

## Parcours recommandé : Foundry et MCP sur le même serveur

Ce parcours utilise un Chromium headless supervisé par le serveur MCP. Aucun
navigateur personnel ne doit rester ouvert et les échanges entre Foundry et le
pont MCP restent sur la machine serveur.

## 1. Installer le module et créer le compte Foundry dédié

Cette méthode ne nécessite ni Node.js ni npm sur la machine Foundry.

Dans l'écran **Configuration et installation** de Foundry :

1. ouvrir **Modules complémentaires** ;
2. cliquer sur **Installer un module** ;
3. coller cette URL dans **URL du manifeste** :

```text
https://raw.githubusercontent.com/Wameuh/Foundry-MC-Server/main/apps/foundry-module/module.json
```

4. cliquer sur **Installer** ;
5. ouvrir le monde D&D5e avec un compte Gamemaster complet ;
6. activer **Foundry MCP Bridge** dans la gestion des modules ;
7. après le rechargement du monde, confirmer **Créer l'assistant** ;
8. copier le bloc affiché avant de fermer la fenêtre.

Cette URL charge le manifeste courant de la branche `main`. Le champ
`download` du manifeste pointe vers l'archive de la release GitHub publiée et
validée correspondante. Pour tester une modification qui n'est pas encore
publiée, voir « Archive locale » plus bas.

Le module crée alors un utilisateur **Foundry**, et non un compte système ou
un client MCP :

- nom : `MCP Bridge GM` ;
- rôle : **Gamemaster** ;
- clé d'accès : valeur aléatoire affichée une seule fois ;
- usage : session Chromium headless réservée au pont MCP.

Le bloc copié contient `FOUNDRY_HEADLESS_ENABLED`,
`FOUNDRY_HEADLESS_USERNAME` et `FOUNDRY_HEADLESS_ACCESS_KEY`. Il devra être
reporté dans la configuration du serveur MCP à l'étape suivante. Si la fenêtre
a été fermée sans copier la clé, définir une nouvelle clé pour cet utilisateur
dans **Gestion des utilisateurs**.

Si la proposition n'apparaît plus, activer **Proposer la création du compte
assistant** dans les paramètres du module puis recharger le monde avec un
Gamemaster complet.

## 2. Installer le serveur MCP sur la même machine

Prérequis : Git, Docker et le module Compose de Docker.

```sh
git clone https://github.com/Wameuh/Foundry-MC-Server.git
cd Foundry-MC-Server
cp .env.example .env
chmod 600 .env
sed -i "s|replace-with-a-long-random-secret|$(openssl rand -hex 32)|" .env
sed -i "s|replace-with-a-different-long-random-secret|$(openssl rand -hex 32)|" .env
```

Configurer l'identifiant technique du monde et la communication locale. Dans
les commandes suivantes, adapter `monde-foundry` et le port `30000` si
nécessaire :

```sh
export FOUNDRY_WORLD_ID="monde-foundry"
export FOUNDRY_LOCAL_PORT="30000"

sed -i "s|TARGET_WORLD_ID=my-world|TARGET_WORLD_ID=${FOUNDRY_WORLD_ID}|" .env
sed -i "s|^FOUNDRY_ORIGIN=.*|FOUNDRY_ORIGIN=http://host.docker.internal:${FOUNDRY_LOCAL_PORT}|" .env
sed -i 's|^MCP_ALLOWED_HOSTS=.*|MCP_ALLOWED_HOSTS=localhost,127.0.0.1|' .env
sed -i 's|^FOUNDRY_HEADLESS_ENABLED=.*|FOUNDRY_HEADLESS_ENABLED=true|' .env
sed -i "s|^FOUNDRY_HEADLESS_URL=.*|FOUNDRY_HEADLESS_URL=http://host.docker.internal:${FOUNDRY_LOCAL_PORT}|" .env
sed -i 's|^FOUNDRY_HEADLESS_BRIDGE_URL=.*|FOUNDRY_HEADLESS_BRIDGE_URL=ws://127.0.0.1:3210/foundry-mcp/bridge|' .env
sed -i 's|^FOUNDRY_HEADLESS_USERNAME=.*|FOUNDRY_HEADLESS_USERNAME=MCP Bridge GM|' .env
```

Reporter la clé affichée par Foundry sans la conserver dans l'historique du
shell :

```sh
read -rsp 'Clé Foundry du compte MCP Bridge GM: ' FOUNDRY_MCP_GM_KEY
echo
sed -i "s|^FOUNDRY_HEADLESS_ACCESS_KEY=.*|FOUNDRY_HEADLESS_ACCESS_KEY=${FOUNDRY_MCP_GM_KEY}|" .env
unset FOUNDRY_MCP_GM_KEY
```

Dans ce déploiement :

- Chromium joint Foundry via `host.docker.internal` sur la machine hôte ;
- le module joint le serveur MCP via `127.0.0.1` à l'intérieur du même
  conteneur ;
- le port MCP est publié uniquement sur `127.0.0.1` de la machine hôte ;
- le serveur configure automatiquement l'URL et le secret du pont dans le
  profil Foundry headless.

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

Amender les règles apprises par les agents :

```sh
nano agent_rules.md
```

Le fichier est monté en lecture seule dans le conteneur et relu à chaque
appel de `foundry_get_agent_rules`. Il n’est donc pas nécessaire de reconstruire
ou redémarrer le serveur. Ouvrir une nouvelle session MCP pour que son contenu
actualisé soit également inclus dans les instructions initiales de l’agent.

Le port `3210` reste lié à `127.0.0.1`. Aucun reverse proxy n'est nécessaire si
le processus Codex s'exécute lui aussi sur ce serveur. Pour autoriser un client
extérieur, configurer HTTPS/WSS avec l'exemple
`deploy/nginx/foundry-mcp.example.conf` et adapter `MCP_ALLOWED_HOSTS`.

## 3. Vérifier la session Foundry automatique

Le serveur ouvre Foundry, se connecte avec `MCP Bridge GM`, vérifie son rôle,
configure le pont puis attend le WebSocket. Consulter les journaux jusqu'à ce
que le pont soit connecté :

```sh
docker compose -f deploy/compose.example.yaml logs -f foundry-mcp
```

Dans une autre session :

```sh
curl --fail http://127.0.0.1:3210/health
```

`bridgeConnected` doit valoir `true`. Les détails et les états intermédiaires
sont décrits dans [Session Foundry GM automatique](headless-foundry.md).

## 4. Connecter Codex exécuté sur ce serveur

Dans un projet distant Codex Desktop, ces commandes doivent être exécutées sur
l'hôte distant où tourne Codex, donc ici sur la même machine que Foundry et le
serveur MCP :

```sh
export MCP_BEARER_TOKEN="copier-la-valeur-MCP_BEARER_TOKEN-du-serveur"
codex mcp add foundry \
  --url http://127.0.0.1:3210/mcp \
  --bearer-token-env-var MCP_BEARER_TOKEN
codex mcp list
```

Reconnecter ensuite l'hôte distant ou ouvrir une nouvelle tâche Codex, puis
utiliser `/mcp` pour vérifier que `foundry` est actif. La variable
`MCP_BEARER_TOKEN` doit être fournie au processus Codex distant par son
gestionnaire de secrets ou son mécanisme de lancement.

## Variante : conserver une session GM manuelle

Le compte `MCP Bridge GM` n'est pas nécessaire dans ce mode. Un navigateur
connecté avec un autre utilisateur Gamemaster doit rester ouvert.

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

Vérifier alors l'état du serveur :

```sh
curl --fail http://127.0.0.1:3210/health
```

Pour une connexion MCP depuis une autre machine, utiliser l'URL HTTPS du
reverse proxy. La configuration détaillée se trouve dans `docs/codex-cli.md`.

## Archive locale du module, réservée au développement

Cette procédure sert uniquement lorsque la release GitHub n'est pas encore
publiée ou pour tester une modification locale :

```sh
npm ci
npm run package:module
MODULE_VERSION="$(node -p "require('./apps/foundry-module/module.json').version")"
unzip -l "artifacts/foundry-mcp-bridge-${MODULE_VERSION}.zip"
```

Extraire ensuite l'archive dans le répertoire de données Foundry :

```sh
mkdir -p /chemin/vers/FoundryVTT/Data/modules/foundry-mcp-bridge
unzip "artifacts/foundry-mcp-bridge-${MODULE_VERSION}.zip" \
  -d /chemin/vers/FoundryVTT/Data/modules/foundry-mcp-bridge
```

Redémarrer Foundry, puis activer le module dans le monde.

Plutonium reste facultatif. La matrice certifiée est Foundry `14.367`, D&D5e
`5.3.3` et Plutonium `2.18.1.v14` ou `2.18.3.v14`.
