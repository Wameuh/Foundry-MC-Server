# Installation

Le serveur MCP est exécuté sur le serveur qui héberge ou atteint Foundry. Le module `Foundry MCP Bridge` doit être installé dans le monde cible.

Le pont nécessite un navigateur GM actif, connecté au monde. Fermer ce navigateur déconnecte le pont et toutes les opérations échouent proprement.

1. Copier `.env.example` vers `.env` et générer deux secrets distincts.
2. Lancer le serveur avec Docker Compose, systemd ou Node 22.
3. Exécuter `npm run package:module`, puis installer l’archive produite dans `artifacts/`.
4. Activer le module dans le monde.
5. Configurer l’URL WSS et le secret du pont.
6. Vérifier `/health`, puis appeler `foundry_get_status` depuis Codex CLI.

Plutonium est facultatif. La seule version certifiée est `2.18.1.v14`, avec Foundry `14.367` et D&D5e `5.3.3`.
