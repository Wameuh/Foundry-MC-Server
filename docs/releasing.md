# Publier une version du module Foundry

Le workflow GitHub Actions `.github/workflows/release.yml` construit et publie
l'archive du module. L'utilisateur final n'exécute donc aucune commande npm.

Après avoir aligné la version de `apps/foundry-module/module.json` et son URL
`download`, valider le projet :

```sh
npm ci
npm run check
npm test
npm run package:module
```

Committer puis pousser les changements :

```sh
git add .
git commit -m "Release v0.1.1"
git push origin main
```

Créer et pousser le tag correspondant exactement à la version du manifeste :

```sh
git tag -a v0.1.1 -m "Foundry MCP Bridge v0.1.1"
git push origin v0.1.1
```

Le tag déclenche les tests, la construction de l'archive et la création de la
release GitHub. Vérifier ensuite les deux URL utilisées par Foundry :

```sh
curl --fail --location \
  https://raw.githubusercontent.com/Wameuh/Foundry-MC-Server/main/apps/foundry-module/module.json

curl --fail --location --output /tmp/foundry-mcp-bridge-0.1.1.zip \
  https://github.com/Wameuh/Foundry-MC-Server/releases/download/v0.1.1/foundry-mcp-bridge-0.1.1.zip

unzip -l /tmp/foundry-mcp-bridge-0.1.1.zip
```
