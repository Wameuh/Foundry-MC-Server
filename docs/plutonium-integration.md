# Contenu Plutonium/5etools local

Le serveur n'exécute plus Plutonium dans Foundry. Il indexe les JSON déjà
installés sous `PLUTONIUM_DATA_PATH` puis convertit déterministement les sorts,
objets et créatures en documents Foundry écrits par le backend direct.

Outils MCP : `content_search`, `content_get`, `content_import_preview`,
`content_import_commit`. Le mode preview doit être utilisé pour inspecter le
document exact avant commit. Les doublons sont refusés sauf `overwrite: true`.
