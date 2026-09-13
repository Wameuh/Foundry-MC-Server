# Intégration Automated Animations

## Contrat API

L’adaptateur utilise uniquement l’API publique documentée de
[Automated Animations](https://github.com/theripper93/autoanimations) :

- `window.AutomatedAnimations.AutorecManager.getAutorecEntries()`
- `window.AutomatedAnimations.playAnimation` (présence vérifiée, non exposée en outil MCP pour l’instant)
- lecture/écriture des flags item `flags.autoanimations`
- recherche catalogue via `Sequencer.Database.getPathsUnder("autoanimations…")` lorsque Sequencer est disponible

Il n’importe pas les classes internes du bundle A-A, n’ouvre pas les menus UI et
n’appelle pas les migrations internes `flagMigrations`.

Les réglages d’item sont écrits au schéma de flags v5 (`isEnabled`,
`isCustomized`, `menu`, `primary.video`, …), aligné sur le menu item A-A actuel.
Pour le `meleeSwitch`, les défauts suivent A-A (`detect: "automatic"`,
`returning: false`, `switchType: "on"`).

Versions certifiées : `7.0.0` et `7.0.17`. Toute autre version est refusée
(`compatible: false`, écritures désactivées).

## Mode `flags` avancé

Quand `flags` est fourni à `autoanimations_set_item_animation`, l’objet remplace
`flags.autoanimations` tel quel. Les champs frères `menu` / `isEnabled` ne sont
pas réinjectés. Seul `version` est complété s’il est absent.
## Outils MCP

| Outil | Effet |
|---|---|
| `autoanimations_get_capabilities` | État du module et capacités annoncées |
| `autoanimations_get_item_animation` | Flags A-A d’un Item + éventuelle correspondance Autorec |
| `autoanimations_set_item_animation` | Affecte une animation (menu + vidéo primaire) à un Item |
| `autoanimations_get_autorec` | Résumé des menus Global Automatic Recognition |
| `autoanimations_search_catalog` | Chemins Sequencer sous `autoanimations.*` |

## Affecter une animation à un sort

1. Vérifier `autoanimations_get_capabilities`.
2. (Optionnel) Chercher une entrée catalogue, ex. `query: "fire_bolt"`, `dbSection: "range"`.
3. Appeler `autoanimations_set_item_animation` avec l’UUID de l’Item sort :

```json
{
  "uuid": "Item.xxxxxxxx",
  "menu": "range",
  "isEnabled": true,
  "primary": {
    "menuType": "spell",
    "animation": "firebolt",
    "variant": "01",
    "color": "orange"
  }
}
```

Les noms `menuType` / `animation` / `variant` / `color` doivent correspondre aux
clés du catalogue A-A/JB2A (pas forcément aux libellés UI localisés).
