# Importer avec Plutonium

Utilise `plutonium_get_capabilities` avant tout import. Si la version certifiée n’est pas active, explique-le et utilise un compendium Foundry si possible.

Pour importer Fireball du PHB, utilise `plutonium_import_reference` avec `type: spell`, `name: Fireball`, `source: PHB`, destination monde. Vérifie le résultat et retourne les UUID créés.

Pour ajouter une entrée à une fiche, identifie l’Actor avec `foundry_get_context`, puis utilise `plutonium_import_entries` avec destination Actor. N’invente jamais un choix interactif.
