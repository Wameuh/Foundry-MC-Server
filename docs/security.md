# Sécurité

Le serveur exige un bearer token MCP et le pont utilise un challenge HMAC avec nonce, world ID et user ID. Seul `game.user.isGM === true` peut s’enregistrer.

Le secret du pont est conservé dans un réglage Foundry réservé au GM et de portée `client`. Il n’est donc ni synchronisé comme réglage du monde, ni placé dans l’URL WebSocket.

Les opérations de création et modification passent par les API publiques Foundry. Les suppressions utilisent `foundry_prepare_delete`, puis `foundry_confirm_delete` avec un jeton à usage unique et expiration courte.

Le projet n’expose ni `eval`, ni JavaScript arbitraire, ni accès à la base Foundry, ni clics automatisés Plutonium. Les secrets et le contenu complet des fiches sont exclus des journaux.
