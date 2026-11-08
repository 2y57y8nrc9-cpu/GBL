# Critères de validation V3 — ajustés selon la direction du projet

## A. Avatar / morphologie
- Maillage humain continu, compatible avec une pose adaptée à l'habillage ; hauteur connue.
- Rapport entre poitrine, bassin, tour de bras et patron vérifié par mensurations et inspection.
- Collisions sur le corps complet ; pas uniquement des ellipsoïdes isolés.
- **Statut actuel** : import OBJ MakeHuman/MPFB proposé, normalisation de taille et collider automatique ; cohérence morphologique exacte non vérifiée par l'outil. Pas d'avatar photoréaliste inclus.

## B. T-shirt de référence
- Devant, dos et deux manches, couture des côtés, épaules et emmanchures cohérente.
- Maillage assez fin pour une surface fluide ; séparer résolution du maillage et lissage des normales.
- Mesurer chaque couture : écart max > 3 cm = revue requise (seuil de diagnostic, non norme industrielle).
- Inspecter l'étirement interne et le tombé, pas seulement les ressorts de couture.
- **Statut actuel** : solveur Blender expérimental ; résultat physique non validé sur nouveau modèle d'avatar.

## C. Reconstruction photo
- Reconstituer les caractéristiques visibles sans inventer les détails cachés.
- Faire intervenir mensurations corporelles réelles ou hypothèses explicitement indiquées.
- Diagnostiquer les erreurs de dimensions et de coutures ; proposer des corrections limitées, préserver la source et journaliser les choix.
- **Statut actuel** : vision locale optionnelle + génération paramétrique de hauts. Aucun modèle photo-patron spécialisé entraîné ; priorité à un premier prototype vérifiable.

## D. Mutation fidèle
- Les traits caractéristiques de l'image et leur étrangeté sont enregistrés explicitement comme contraintes.
- Explorer plusieurs variations, garder l'original, mesurer les déformations de contours et écarts de couture.
- Conserver les anomalies voulues ; ne pas réduire toute différence à un bruit graphique.
- **Statut actuel** : évaluation géométrique uniquement, pas d'évaluation perceptuelle automatique.

## E. Rendu type CLO3D
- Simulation de tissus calibrée (masse surfacique, rigidités, comportement sous gravité, collisions et auto-collisions).
- Avatar humain crédible, shaders peau et matières PBR ; contrôler la silhouette sur plusieurs angles.
- **Statut actuel** : Blender Cloth expérimental avec lissage de rendu. CLO3D et son niveau de réalisme ne sont pas reproduits.

## Tests de non-régression à conserver
- Test T-shirt original et mannequin avant toute mutation.
- Test photo de haut simple → JSON révisable.
- Test seed identique ⇒ mutation identique.
- Test de coutures : rapport et source conservés.
- Test d'erreur : refuser une veste/pantalon non pris en charge sans prétendre générer un patron réaliste.
