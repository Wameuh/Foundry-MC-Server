# Foundry MCP

Serveur MCP et module pont pour piloter Foundry VTT 14 depuis Codex CLI ou un
autre client MCP. Le pont s'exécute dans le navigateur d'un GM et utilise les
API publiques de Foundry, ainsi qu'un adaptateur Plutonium optionnel.

## Installation

Le module Foundry et le serveur MCP sont deux composants différents :

- le module s'installe depuis l'interface Foundry avec une URL de manifeste ;
- le serveur MCP est un service Node.js indépendant, déployé de préférence avec Docker ;
- Codex CLI se connecte ensuite au serveur MCP en HTTPS.

Les commandes complètes sont dans [docs/installation.md](docs/installation.md).
La construction npm du module n'est nécessaire que pour le développement ou
pour produire une archive locale avant la publication d'une release GitHub.
La procédure de publication est décrite dans [docs/releasing.md](docs/releasing.md).

## Développement

Prérequis : Node.js 22 et npm.

```sh
npm install
npm run check
npm test
npm run build
npm run package:module
```

Le projet ne fixe aucun objectif de couverture. Les tests privilégient les
parcours complets (client MCP, pont GM, opérations Foundry, Plutonium et
confirmation des suppressions) ; les tests unitaires sont réservés aux
contrats et garde-fous de sécurité.

Pour lancer les vérifications depuis une copie de développement :

```sh
git clone https://github.com/Wameuh/Foundry-MC-Server.git
cd Foundry-MC-Server
npm ci
npm run check
npm test
npm run build
npm run package:module
```

Ne jamais committer le fichier `.env`.

La documentation d'installation et de configuration détaillée se trouve dans
`docs/`.
