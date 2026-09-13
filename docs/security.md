# Sécurité

Le serveur exige un bearer token MCP et le pont utilise un challenge HMAC avec nonce, world ID et user ID. Seul `game.user.isGM === true` peut s’enregistrer.

Le secret du pont est conservé dans un réglage Foundry réservé au GM et de portée `client`. Il n’est donc ni synchronisé comme réglage du monde, ni placé dans l’URL WebSocket.

Les opérations de création et modification passent par les API publiques Foundry. Les suppressions utilisent `foundry_prepare_delete`, puis `foundry_confirm_delete` avec un jeton à usage unique et expiration courte.

Le projet n’expose ni `eval`, ni JavaScript arbitraire, ni accès à la base Foundry, ni clics automatisés Plutonium. Les secrets et le contenu complet des fiches sont exclus des journaux.

En mode headless, la clé d'accès du compte GM technique est fournie uniquement
par `FOUNDRY_HEADLESS_ACCESS_KEY`. Le fichier `.env` doit être limité au compte
de service (`chmod 600 .env`). Le navigateur utilise le formulaire de connexion
Foundry normal ; aucune route d'authentification privée n'est appelée
directement. Utiliser un compte dédié évite de partager les identifiants du GM
habituel.

Le sandbox Chromium reste activé par défaut. `FOUNDRY_HEADLESS_CHROMIUM_NO_SANDBOX`
ne doit être passé à `true` (ou `auto`) que lorsque l'environnement l'exige ;
cela retire une frontière de sécurité du processus navigateur. En mode `auto`,
le repli sans sandbox n'est déclenché que par un diagnostic Chromium explicite
sur le sandbox, jamais par un crash générique. Le nettoyage du profil n'envoie
aucun signal aux navigateurs : il refuse d'agir si le profil est encore utilisé
ou si l'inspection des processus échoue. `FOUNDRY_HEADLESS_PROFILE_PATH` doit
rester un répertoire dédié exclusivement à cette instance du serveur MCP.
