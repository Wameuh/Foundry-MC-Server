# Règles pour la création de contenu Foundry

## Ne jamais laisser de marqueurs techniques visibles

- Ne pas insérer de marqueurs comme `[[/...]]` dans une description sans avoir vérifié qu'ils sont interprétés par la version active de Foundry et du système D&D5e.
- Si leur rendu n'est pas garanti, utiliser un texte descriptif clair en français.
- Après chaque création ou traduction, relire les descriptions enregistrées et vérifier qu'aucun marqueur technique brut n'est visible sur la fiche.

## Créer des éléments réellement fonctionnels

- Une attaque, un sort ou une capacité ne doit pas être créé comme une simple description textuelle.
- Chaque élément utilisable doit posséder une activité Foundry correctement configurée afin que son bouton lance réellement les jets attendus.
- Pour une attaque, configurer au minimum le type d'attaque, la caractéristique utilisée, la maîtrise, le bonus au toucher, la portée, les cibles, les dégâts et leurs types. Les bonus doivent être calculés automatiquement à partir des données de l'acteur lorsque c'est approprié.
- Pour un pouvoir imposant un jet de sauvegarde, configurer la caractéristique du jet, le DD, la portée, les cibles, les dégâts ou états appliqués, ainsi que la durée pertinente.
- Pour un sort, créer ou importer un véritable objet de type sort avec ses activités, son niveau, sa méthode d'incantation, ses composantes, sa portée, sa cible, ses effets et sa consommation d'emplacement ou de ressource.
- Pour une capacité, configurer son type d'action, ses usages, sa récupération, ses jets et ses effets au lieu de seulement les mentionner dans le texte.
- Les usages limités, recharges et consommations de ressources doivent être suivis automatiquement par Foundry.

## Vérification obligatoire

- Avant d'annoncer qu'un PNJ est terminé, vérifier chaque attaque, sort et capacité utilisable.
- Confirmer que les activités existent et que leurs paramètres correspondent à la fiche source.
- Effectuer un jet de test lorsque l'outil le permet. À défaut, inspecter les données enregistrées et ne pas prétendre que l'élément est fonctionnel sans preuve.
- Vérifier les bonus au toucher, DD de sauvegarde, formules de dégâts, portées, cibles, usages et récupérations.
- Vérifier séparément le nom, la description française et le fonctionnement mécanique de chaque objet intégré.

## Leçon tirée de la Matriarche harpie

La création d'un acteur et de descriptions correctes ne suffit pas. Dans le cas de la Matriarche harpie, les attaques avaient été décrites et leurs dégâts renseignés, mais aucune activité fonctionnelle ne permettait de lancer les jets avec les bonus automatiques. Une fiche Foundry n'est complète que lorsque ses actions sont utilisables directement depuis l'interface.
