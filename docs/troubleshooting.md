# Dépannage

- **`FOUNDRY_UNPROVISIONED`** : ouvrir le monde en GM, activer le module et
  accepter le provisioning du compte technique.
- **backend déconnecté** : vérifier `FOUNDRY_DIRECT_URL`, que le monde
  `TARGET_WORLD_ID` est actif, et que le compte technique est GM.
- **le panneau AgentControl ne répond pas** : vérifier `AGENTCONTROL_TCP`,
  `AGENTCONTROL_TOKEN_PATH`, et que le daemon accepte la connexion.
- **`content_*` indique catalog not configured** : définir `PLUTONIUM_DATA_PATH`
  vers le répertoire `data` de Plutonium/5etools et redémarrer.
- **websocket refusé** : vérifier que le secret du module correspond à
  `FOUNDRY_BRIDGE_SECRET` et que l'origine correspond à `FOUNDRY_ORIGIN`.
- **`/health`** indique seulement l'état du canal de contrôle ; utiliser
  `foundry_get_status` pour l'état du backend direct.
