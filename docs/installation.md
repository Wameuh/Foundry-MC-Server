# Installation

L'architecture courante est backend-direct : le serveur MCP se connecte à
Foundry en Socket.IO avec un compte technique. Aucun Chromium headless et aucun
pont opérationnel navigateur ne sont nécessaires.

La procédure de référence est dans le README racine : build/package du module,
configuration de `.env`, déploiement Node ou Docker, provisioning initial depuis
un navigateur GM, puis fonctionnement autonome du backend.

Le websocket navigateur reste seulement un canal de contrôle pour provisioning
et AgentControl. Les documents sont modifiés exclusivement par la connexion
directe du serveur.
