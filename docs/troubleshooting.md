# Dépannage

**`BRIDGE_UNAVAILABLE`** : ouvrir le monde dans un navigateur et se connecter avec un GM. Vérifier l’URL WSS, le reverse proxy et le secret.

**Plutonium indisponible** : vérifier que le module est actif et que sa version est `2.18.1.v14` ou `2.18.3.v14`. Les outils Foundry restent utilisables sans lui.

**`PLUTONIUM_IMPORT_TIMEOUT`** : vérifier la connexion du navigateur GM et
consulter les notifications Foundry. Les imports de créatures peuvent charger
le catalogue, les groupes légendaires et les images depuis la source configurée
dans Plutonium. Si `5e.tools` est inaccessible ou répond `403`, configurer le
backend ou un miroir de données Plutonium, ou fournir une entrée JSON autonome.
Ne pas relancer aveuglément un import non idempotent.

**Erreur de permission** : seul un utilisateur GM peut enregistrer le pont et modifier le monde.

**`headlessBrowser.state` reste sur `authenticating`** : vérifier le nom exact
du compte Foundry dédié, sa clé d'accès et son rôle GM. Les échecs détaillés sont
écrits dans les journaux sans afficher la clé.

**`headlessBrowser.state` reste sur `waiting_for_bridge`** : vérifier que
Foundry MCP Bridge est actif dans le monde, que `FOUNDRY_ORIGIN` correspond
exactement à l'origine de `FOUNDRY_HEADLESS_URL`, et que le secret du pont est
identique. Avec Plutonium, conserver au moins `180000` pour
`FOUNDRY_HEADLESS_BRIDGE_GRACE_MS`, car son hook `ready` peut continuer après
que Foundry a déjà marqué le monde comme prêt.

**Docker ne joint pas Foundry** : avec le Compose fourni, utiliser
`http://host.docker.internal:30000` pour `FOUNDRY_ORIGIN` et
`FOUNDRY_HEADLESS_URL`. Le WebSocket interne reste sur
`ws://127.0.0.1:3210/foundry-mcp/bridge`.
