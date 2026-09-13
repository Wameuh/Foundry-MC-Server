# Publier une version du module Foundry

Le workflow GitHub Actions `.github/workflows/release.yml` construit et publie
l'archive du module. L'utilisateur final n'exécute donc aucune commande npm.

Après avoir aligné la version de `apps/foundry-module/module.json` et son URL
`download`, des quatre `package.json` et de `APPLICATION_VERSION`, valider le
projet. `verify:manifests` refuse une publication si ces versions divergent :

```sh
npm ci
npm run check
npm test
npm run package:module
```

Contrôler les fichiers à publier, puis committer et pousser les changements.
Ne jamais ajouter `.env` ou un fichier contenant des identifiants :

```sh
git status --short
git add -A
git diff --cached --check
git commit -m "Release v0.2.5"
git push origin main
```

Créer et pousser le tag correspondant exactement à la version du manifeste :

```sh
VERSION="$(node -p "require('./apps/foundry-module/module.json').version")"
git tag -a "v${VERSION}" -m "Foundry MCP Bridge v${VERSION}"
git push origin "v${VERSION}"
```

Le tag déclenche les tests, la construction de l'archive et la création de la
release GitHub. Vérifier ensuite les deux URL utilisées par Foundry :

```sh
curl --fail --location \
  https://raw.githubusercontent.com/Wameuh/Foundry-MC-Server/main/apps/foundry-module/module.json

curl --fail --location --output "/tmp/foundry-mcp-bridge-${VERSION}.zip" \
  "https://github.com/Wameuh/Foundry-MC-Server/releases/download/v${VERSION}/foundry-mcp-bridge-${VERSION}.zip"

unzip -l "/tmp/foundry-mcp-bridge-${VERSION}.zip"
```
