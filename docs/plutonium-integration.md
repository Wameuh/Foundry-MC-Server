# Intégration Plutonium

## Contrat utilisé

L’adaptateur appelle uniquement l’API publiée dans
`game.modules.get("plutonium").api` : `importer.pGetImporter`, `ImportOpts`,
`util.uuidFauxCompendium`, `config.getValue` et les hooks publics.

Il n’utilise pas `salphar`, les classes internes du bundle, `pImportAll`
déprécié, le backend interne ou les fenêtres interactives. Les entrées JSON
sont validées et limitées à 20 entrées/2 MiB.

Les versions certifiées sont `2.18.1.v14` et `2.18.3.v14`, avec Foundry
`14.367` et D&D5e `5.3.3`. Toute autre version désactive Plutonium tout en
laissant les outils Foundry natifs disponibles.

Plutonium publie son API à la fin de sa propre initialisation asynchrone. Le
pont accepte donc de démarrer sans cette API, puis la détecte à nouveau lors
du premier appel. La découverte des capacités n’initialise pas tous les
importateurs : `pGetImporter` appelle lui-même `pInit` et certains importateurs
chargent des données supplémentaires.

## Catalogue D&D5e et 5etools

Pour D&D5e, les noms et sources sont ceux de 5etools. Plutonium contient déjà
des copies locales de ses catalogues principaux sous son propre module et les
préfère par défaut. Son chargeur peut utiliser le CDN 5etools, un miroir
configuré, le prerelease ou le homebrew lorsque les données locales ne
suffisent pas. Le serveur MCP ne scrape donc pas les pages HTML de 5e.tools et
n’accepte aucune URL de catalogue arbitraire.

Le type MCP et la propriété JSON ne sont pas toujours identiques. Pour les
versions certifiées :

| Type MCP | Importateur Plutonium | `data.__prop` 5etools |
|---|---|---|
| `creature` | `monster` (alias `creature`) | `monster` |
| `spell` | `spell` | `spell` |
| autres types MVP | type MCP correspondant | type MCP correspondant |

Cette table est versionnée dans l’adaptateur. Une créature avec
`data.__prop: "creature"` est refusée : une entrée canonique 5etools utilise
`monster`.

## Deux chemins d’import

Un import par référence exige `type`, `name` et `source`. Plutonium transforme
cette référence en faux UUID, charge l’entrée depuis son catalogue, puis crée
le Document. Ce chemin n’est annoncé que si le réglage Plutonium
`misc.isPatchFromUuid` est actif. La résolution est une opération d’écriture,
pas une recherche sans effet de bord.

Un import JSON exige `prop`, `name`, `source` et un `data.__prop` canonique. Le
pont choisit l’importateur à partir de la table versionnée, construit des
`ImportOpts` restreints, puis inspecte l’`ImportSummary` retourné. Plutonium
représente les statuts par des `Symbol`; les imports terminés, ignorés, écrasés
et échoués sont donc normalisés explicitement.

Un délai dépassé n’annule pas la promesse Plutonium déjà lancée dans le
navigateur. Le Document peut apparaître plus tard. Après un timeout, rechercher
le Document par nom et source avant toute nouvelle tentative.

Les imports qui exigent un choix humain sont refusés au lieu de simuler leur
interface.
