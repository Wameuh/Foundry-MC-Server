# Installation du module Foundry

1. Construire l’archive du module avec `node scripts/package-foundry-module.mjs`.
2. Installer l’archive depuis l’interface d’administration Foundry.
3. Activer `Foundry MCP Bridge` dans le monde.
4. Configurer l’URL WSS et le secret dans les réglages du module.
5. Ouvrir le monde dans un navigateur avec un utilisateur GM.

Le navigateur GM doit rester ouvert et connecté : il exécute les API Foundry et Plutonium. Le serveur MCP seul ne peut pas manipuler le monde.

Plutonium est optionnel pour les opérations Foundry natives. La seule version Plutonium certifiée est `2.18.1.v14` avec Foundry `14.367` et D&D5e `5.3.3`.
