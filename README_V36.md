# Garment Bending Lab V3.6 — Banc de validation autonome

## Pourquoi ce correctif ?

L'objectif est d'arrêter les cycles de « correction annoncée → essai utilisateur → nouveau plantage ».
La V3.6 contient des tests reproductibles et un lanceur qui effectue de lui-même une campagne de **six simulations Blender** sur **un unique patron JSON** et **un même avatar MPFB**, puis élimine les résultats présentant des anomalies manifestes. Le système ne modifie **jamais les mensurations du patron** pour maquiller un problème.

**ATTENTION : je n'ai pas pu exécuter Blender ni MPFB dans l'environnement où cette archive a été créée. La V3.6 n'est PAS un T-shirt physiquement validé.** Toutes les mesures d'optimisation documentées ici proviennent d'un mannequin mathématique SYNTHÉTIQUE ; la validation physique sur un véritable MPFB reste indispensable.

## Démarrer, en une seule action sur ton Mac

1. Décompresser tout le dossier `GBL-V3.6-Autonomous-Validation` dans Téléchargements.
2. Garder Blender 5.2.x et son extension MPFB installés (comme précédemment). Python 3 est également nécessaire.
3. Dans Finder, double-cliquer `VALIDATION_AUTOMATIQUE.command` et autoriser l'exécution si macOS la bloque. L'alternative Terminal est `bash VALIDATION_AUTOMATIQUE.command` depuis le dossier du projet.
4. Ne pas intervenir pendant les six simulations : elles sont exécutées et évaluées successivement, avec des rapports individuels.
5. À la fin, lire `runs/validation_auto/<identifiant>/rapport_comparatif.html` (ouvert automatiquement si macOS le permet), puis `meilleur_resultat.txt`.

Le lanceur réutilise le dernier avatar MPFB réel sous `runs/avatars/` ; s'il n'existe pas, il essaie de le **générer automatiquement avec MPFB dans Blender**. Il refuse les faux OBJ d'exemple sans véritable corps humain. Tu peux aussi fournir `--avatar /chemin/existant/vers/MPFB.obj` si besoin, mais ce n'est pas nécessaire en usage normal. Le modèle par défaut est réglé à 174 cm ; `--height-cm 185` change la taille générée. Si tu as un avatar déjà créé, il est réutilisé à l'identique dans les six scénarios.

Le patron référence est `patrons_json/01_tshirt_regular_specification.json` ; aucune mutation n'est activée. Si un patron trop petit est sélectionné, le programme doit bloquer les calculs plutôt que le modifier en silence.

## Qu'est-ce qui est réellement testé ?

- Version sans nouveau placement (référence).
- Placement anatomique MPFB, manches orientées en A.
- Pré-ajustement élastique avec contraintes de longueurs 2D.
- Plusieurs rigidités, amortissements, masses et distances de contact.
- Variante sans auto-collision afin de diagnostiquer le rôle de ce paramètre ; sa désactivation n'est pas considérée comme meilleure a priori.

Chaque candidat doit passer **tous** les contrôles : avatar debout et collisions actives ; patron et tour de buste compatibles avec les **sections du véritable avatar MPFB**, géométrie cousue connectée et manifold, moins de 1 % de sommets sous la surface corporelle (mesure discrète approximative), moins de 8 % d'arêtes fortement déformées par rapport au **patron 2D original**, épaules alignées et **mouvement résiduel inférieur aux seuils sur les dernières frames**. Ce sont des seuils de rejet automatisés, pas une certification de couturabilité ni une équivalence avec CLO3D.

Si aucune variante ne passe : le rapport indique **AUCUN DRAPÉ VALIDÉ**. Les logs Blender, OBJ, images et rapports restent sauvegardés. Le logiciel n'invente ni résultat ni image manquante.

## Résultats effectivement mesurés pendant le développement

**121 tests Python réussis** (au moment du paquet). Plusieurs milliers de sommets/triangles ont été produits, vérifiés et comparés **hors Blender**, avec un avatar synthétique en pose A. Lors des expériences avec le pré-ajustement géométrique à partir des longueurs du patron 2D, un réglage `anatomique + manches A + poids collision 4000` produisait environ **0,11 %** de sommets encore dans le volume synthétique et **3,56 %** de fortes déformations d'arêtes ; ces valeurs sont géométriques, et non des résultats de tissu en mouvement. Certains autres réglages passaient au-dessus de 10 % de déformation : ils ne doivent pas être retenus.

La variante avec **un niveau de subdivision** avait des arêtes non-manifold après soudure. Avec **deux ou trois niveaux**, le maillage synthétique de référence devenait une composante connectée manifold ; deux niveaux sont retenus pour ne pas multiplier inutilement le coût du calcul.

**Nombre de simulations Blender/MPFB exécutées pour construire la V3.6 dans cet environnement : zéro.** L'exécutable `Blender` et le module MPFB étaient absents et leur installation externe inaccessible. Le banc a été testé en mode erreurs, y compris l'absence de Blender, et **refuse alors de prétendre à un succès**.

## Fichiers utiles

- `auto_validation.py` : campagne multi-scénarios + sélection conservatrice.
- `VALIDATION_AUTOMATIQUE.command` : démarrage Finder/Terminal.
- `garmentlab/elastic_refit.py` : pré-ajustement 3D élastique avant Blender, sans SciPy.
- `garmentlab/anthropometry.py` : estimation des mensurations à partir de sections de l'avatar MPFB.
- `garmentlab/drape_quality.py` : suivi des longueurs du **patron 2D** même après soudure des coutures.
- `validation_geometrie/comparaison_geometrie.png` : visualisation de géométrie synthétique, **pas** un drapé textile.
- `validation_geometrie/*.json` : mesures hors Blender et comparaisons de réglages.

## Conclusion

Ce paquet réduit le travail manuel de comparaison, améliore les diagnostics, et contient un optimiseur géométrique expérimental. Il ne remplace pas encore un moteur de simulation textile crédible. Si la campagne ne trouve aucun candidat validé, il faudra traiter les défauts structurels identifiés par ses rapports avant de poursuivre le travail IA photo → patron → mutation.
