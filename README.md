# Foundry MCP

Serveur MCP et module pont pour piloter Foundry VTT 14 depuis Codex CLI ou un
autre client MCP. Le pont s'exécute dans le navigateur d'un GM et utilise les
API publiques de Foundry, ainsi qu'un adaptateur Plutonium optionnel.

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

Copier `.env.example` vers `.env`, puis remplacer les deux secrets par des
valeurs longues, aléatoires et distinctes. Ne jamais committer `.env`.

La documentation d'installation et de configuration détaillée se trouve dans
`docs/`.
