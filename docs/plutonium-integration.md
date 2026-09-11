# Intégration Plutonium

L’adaptateur appelle uniquement `game.modules.get("plutonium").api`, notamment `importer.pGetImporter`, `ImportOpts`, la résolution d’UUID et le hook public de fin d’import.

Il n’utilise pas `salphar`, les classes du bundle, `pImportAll` déprécié ou les fenêtres interactives. Les entrées JSON sont validées et limitées à 20 entrées/2 MiB.

La version certifiée est exclusivement `2.18.1.v14`, avec Foundry `14.367` et D&D5e `5.3.3`. Toute autre version désactive Plutonium tout en laissant les outils Foundry natifs disponibles.

Un import par référence exige le type, le nom et la source. Un import JSON exige `prop`, `name`, `source` et un `data.__prop` identique. Les imports interactifs retournent une erreur explicite au lieu de simuler une interface.
