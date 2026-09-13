# Outils MCP

Règles : `foundry_get_agent_rules` retourne la version actuelle du manuel
administrateur. Le même contenu est disponible comme ressource
`foundry://agent-rules` et est inclus dans les instructions de connexion MCP.

Lecture : `foundry_get_status`, `foundry_get_context`, `foundry_get_schema`, `foundry_search_documents`, `foundry_get_document`, `foundry_search_compendiums`.

Écriture : `foundry_create_documents`, `foundry_update_documents`, `foundry_create_embedded`, `foundry_update_embedded`, `foundry_import_compendium`, `dnd5e_build_character`.

Plutonium : `plutonium_get_capabilities`, `plutonium_import_reference`, `plutonium_import_entries`.

Automated Animations : `autoanimations_get_capabilities`, `autoanimations_get_item_animation`, `autoanimations_set_item_animation`, `autoanimations_get_autorec`, `autoanimations_search_catalog`.

Suppression : `foundry_prepare_delete`, puis `foundry_confirm_delete`.

Un navigateur GM actif est requis pour tous les outils qui parlent à Foundry. Les imports Plutonium ne sont disponibles que si la capacité correspondante est annoncée par le pont. Les outils Automated Animations nécessitent le module `autoanimations` actif et l’API publique `window.AutomatedAnimations`.
