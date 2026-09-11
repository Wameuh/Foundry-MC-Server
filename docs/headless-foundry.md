# Session Foundry GM automatique

Le serveur MCP peut lancer et superviser lui-même un Chromium headless. Cette
session remplace le navigateur GM personnel pour exécuter les API Foundry,
D&D5e et Plutonium.

## Créer le compte depuis le module

Lors de sa première activation dans un monde, Foundry MCP Bridge propose au GM
de créer `MCP Bridge GM`. La création exige une confirmation explicite. Le
module génère une clé d'accès aléatoire, crée le compte avec le rôle
**Gamemaster**, puis affiche une seule fois un bloc `.env` prêt à copier.

Après avoir copié ce bloc, fermer le dialogue. En cas de fermeture avant copie,
définir une nouvelle clé depuis **Gestion des utilisateurs**, puis renseigner
manuellement `FOUNDRY_HEADLESS_ACCESS_KEY`.

Le réglage **Proposer la création du compte assistant** permet de réactiver le
dialogue si sa première proposition a été refusée. Le module ne remplace jamais
un utilisateur existant portant le même nom.

## Configuration Docker locale

Le navigateur s'exécute dans le même conteneur que le serveur MCP. Le nom
`host.docker.internal` lui permet de joindre Foundry sur la machine hôte, tandis
que le WebSocket du module reste entièrement dans le conteneur.

Depuis la racine du dépôt :

```sh
cp .env.example .env
chmod 600 .env

sed -i 's|^FOUNDRY_ORIGIN=.*|FOUNDRY_ORIGIN=http://host.docker.internal:30000|' .env
sed -i 's|^FOUNDRY_HEADLESS_ENABLED=.*|FOUNDRY_HEADLESS_ENABLED=true|' .env
sed -i 's|^FOUNDRY_HEADLESS_URL=.*|FOUNDRY_HEADLESS_URL=http://host.docker.internal:30000|' .env
sed -i 's|^FOUNDRY_HEADLESS_BRIDGE_URL=.*|FOUNDRY_HEADLESS_BRIDGE_URL=ws://127.0.0.1:3210/foundry-mcp/bridge|' .env
sed -i 's|^FOUNDRY_HEADLESS_USERNAME=.*|FOUNDRY_HEADLESS_USERNAME=MCP Bridge GM|' .env
```

Si le bloc généré n'a pas été copié directement, saisir la clé sans la conserver
dans l'historique du shell :

```sh
read -rsp 'Clé Foundry du compte MCP Bridge GM: ' FOUNDRY_MCP_GM_KEY
echo
sed -i "s|^FOUNDRY_HEADLESS_ACCESS_KEY=.*|FOUNDRY_HEADLESS_ACCESS_KEY=${FOUNDRY_MCP_GM_KEY}|" .env
unset FOUNDRY_MCP_GM_KEY
```

Construire et démarrer :

```sh
mkdir -p data
docker compose -f deploy/compose.example.yaml up -d --build
docker compose -f deploy/compose.example.yaml logs -f foundry-mcp
```

Vérifier l'état :

```sh
curl --fail http://127.0.0.1:3210/health
```

La réponse suit successivement les états `starting`, `authenticating`,
`waiting_for_bridge`, puis `connected`. `bridgeConnected` doit alors valoir
`true`.

## Exécution sans Docker

Installer Chromium et les dépendances Node, puis compiler :

```sh
sudo apt-get update
sudo apt-get install -y chromium
npm ci
npm run build
```

Lorsque Foundry et le serveur MCP s'exécutent directement sur la même machine,
utiliser ces valeurs :

```env
FOUNDRY_ORIGIN=http://127.0.0.1:30000
FOUNDRY_HEADLESS_ENABLED=true
FOUNDRY_HEADLESS_URL=http://127.0.0.1:30000
FOUNDRY_HEADLESS_USERNAME=MCP Bridge GM
FOUNDRY_HEADLESS_ACCESS_KEY=une-cle-foundry-forte
FOUNDRY_HEADLESS_BRIDGE_URL=ws://127.0.0.1:3210/foundry-mcp/bridge
FOUNDRY_HEADLESS_CHROMIUM_PATH=/usr/bin/chromium
FOUNDRY_HEADLESS_PROFILE_PATH=./data/chromium-profile
FOUNDRY_HEADLESS_READY_TIMEOUT_MS=300000
FOUNDRY_HEADLESS_BRIDGE_GRACE_MS=180000
```

Démarrer ensuite le serveur :

```sh
npm start --workspace @foundry-mcp/server
```

## Cycle de vie

Le serveur ouvre `/game`. Si Foundry redirige vers `/join`, il remplit le
formulaire normal avec le compte dédié. Une fois le monde chargé, il vérifie le
rôle GM et l'activation du module, configure l'URL et le secret du pont dans le
profil client, puis attend l'enregistrement du WebSocket.

Le délai de chargement du monde est de cinq minutes par défaut, car D&D5e et
Plutonium peuvent être lents sur une petite machine. Il est réglable avec
`FOUNDRY_HEADLESS_READY_TIMEOUT_MS`.

Une fois le monde déclaré prêt, le module dispose de trois minutes pour ouvrir
le pont. Ce second délai, réglable avec
`FOUNDRY_HEADLESS_BRIDGE_GRACE_MS`, évite une reconnexion inutile lorsque
Plutonium termine encore ses tâches asynchrones du hook `ready`.

Après une expiration de session, un redémarrage de Foundry ou une déconnexion
du pont, le navigateur est fermé puis relancé avec un délai fixe configurable.
Le profil Chromium persiste dans `FOUNDRY_HEADLESS_PROFILE_PATH`, mais le serveur
sait se réauthentifier lorsque le cookie n'est plus valide.

Les identifiants, le secret du pont et le contenu des fiches ne sont jamais
écrits dans les journaux.
