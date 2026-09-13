# Compatibilité

| Composant | Version certifiée |
|---|---|
| Node.js | 22.x |
| Foundry VTT | 14.367 |
| D&D5e | 5.3.3 |
| Plutonium | 2.15.8* ; 2.18.1.v14 et 2.18.3.v14 |
| Navigateur | Chromium récent |

Une session de navigateur GM active et connectée est une précondition de
fonctionnement. Elle peut être manuelle ou supervisée en mode Chromium
headless par le serveur MCP. Plutonium est optionnel ; ses versions
`2.18.1.v14` et `2.18.3.v14` sont certifiées. La version `2.15.8` est
explicitement supportée après vérification de son bundle Foundry 14 et du
contrat d’import ; une validation live avec cette version reste recommandée.
Les versions non testées échouent fermement pour les imports Plutonium.

\* `2.15.8` est publiée avec un numéro non suffixé dans son manifeste Foundry 14.
