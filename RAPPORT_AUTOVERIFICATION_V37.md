# Garment Bending Lab V3.7 — Rapport d'auto-vérification

**Verdict : T-SHIRT STABLE SUR AVATAR MPFB RÉEL NON VALIDÉ.**

Ce rapport concerne le patron témoin `patrons_json/01_tshirt_regular_specification.json`. Le JSON n'a pas été redimensionné pour améliorer artificiellement l'ajustement.

## Pourquoi la V3.6.1 s'arrêtait

Le journal `blender-9.log` transmis par l'utilisateur établit que le maillage cousu contenait 1 146 sommets, 2 144 triangles, une seule composante et zéro arête non-manifold. Toutefois **16,23 %** des arêtes divergeaient fortement de leurs longueurs dans le patron à plat. Avant l'assemblage, 124 sommets pénétraient le corps et des corrections locales atteignaient 8,43 cm. Le blocage à 10 % a donc correctement évité d'engager le calcul sur une géométrie déjà déformée.

## Correction essayée ici

1. **Recherche conjointe** plutôt que projection successive : la position des sommets, les longueurs du patron 2D, les ancrages et la peau corporelle sont optimisés ensemble.
2. **Rigidité fonction de la taille des arêtes** : de petites arêtes de 9 mm n'étaient presque pas pénalisées pour des étirements de 200 à 300 % avec l'ancien modèle en erreur absolue. L'optimiseur teste désormais trois pondérations (exposants 0, 1, 2), plusieurs rigidités de contact et deux marges autour du corps, soit **18 poses**.
3. **Aucune projection après l'optimisation** : l'ancien `clear_joined_shell` dégradait souvent à nouveau les dimensions 2D.
4. **Rejet strict et explicite** : un pré-ajustement non conforme empêche la simulation ; son rapport JSON reste sauvegardé.
5. **Contacts triangles/peau** : contrôle BVH ajouté au rapport Blender (complète les mesures de pénétration des seuls sommets).
6. **Statut honnête** : `calculation_finished=true` est distinct de `success=true` et dépend maintenant du verdict du drapé.

## Mesures obtenues — modèle SYNTHÉTIQUE (non MPFB)

| Mesure | Résultat | Interprétation |
|---|---:|---|
| Candidats statiques comparés | 18 | Recherche automatique exhaustive des paramètres définis |
| Meilleur candidat | collision 4000, marge 10 mm, exposant 2 | Sélection automatique |
| Arêtes avec fort écart au patron 2D | **0,90 %** | Pré-pose géométrique uniquement |
| Sommets géométriquement sous la surface | **0,44 %** | Contact approximé sur corps synthétique |
| Déplacement maximal pour obtenir la pose | **12,96 cm** | Encore important ; à examiner visuellement |
| Rapport de longueur maximal d'une arête | **2,596** | Défaut local résiduel ; pas une fidélité millimétrique parfaite |

Même avec ces chiffres, **la meilleure pose n'est pas un T-shirt physiquement validé**. Le rendu dans `validation_dynamique/Preajustement_optimise.png` montre un torse et des bras de référence **synthétiques**, pas un avatar humain MPFB. Les faces 3D ne constituent pas une simulation de drapé.

## Campagne dynamique — variantes volontairement REJETÉES

Des simulations simplifiées CPU (ressorts et collisions analytiques) ont été réellement exécutées ici ; **elles ne sont pas Blender Cloth, ni un solveur textile calibré**.

| Famille d'essais | Observation | Verdict |
|---|---|---|
| Explicite PBD — trois réglages | Forte déformation du tissu, jusqu'à environ 25–31 % d'arêtes anormales | Rejeté |
| Implicite initial — trois réglages | 18–35 % d'arêtes anormales | Rejeté |
| Implicite avec rigidités augmentées | Certains scénarios stabilisent le mouvement mais dépassent encore 12 % d'erreurs de coupe | Rejeté |
| Implicite pondéré, avec *maintien artificiel de forme* | Environ 1,7 % d'arêtes anormales à 160 étapes, mais déplacement médian encore ~1,9 mm/étape | **Rejeté : mouvement persistant et contrainte de forme non calibrée** |

La distinction est importante : un vêtement peut être quasiment immobile sans être une simulation correcte des matières, et un pré-placement avec faible déformation peut diverger pendant le calcul.

## Vérifications logicielles exécutées

- `python -m pytest -q` : **130 tests passés**.
- `python -m compileall` : réussi.
- Assemblage du patron témoin : topologie connectée sur la pose synthétique.
- Test de pré-ajustement impossible : rejet conforme attendu.
- **Blender 5.2.3 + MPFB sur le véritable avatar : non exécutés dans cet environnement** (binaire absent ; accès au téléchargement externe indisponible).

## Validation autonome réelle

Sur un Mac déjà équipé de Blender/MPFB, l'archive conserve `VALIDATION_AUTOMATIQUE.command`. Ce lancement unique compare six configurations physiques et conserve leurs rapports sous `runs/validation_auto`. Désormais, **chaque configuration effectue d'abord une recherche interne de pré-ajustement** ; aucun candidat non vérifié ne doit être annoncé comme validé.

La version V3.7 ne prétend donc pas avoir atteint l'objectif final. Il reste à confirmer sur le corps MPFB réel : vêtements enveloppant le torse et les bras ; absence d'intersection de triangles et d'auto-intersection importante ; respect des dimensions 2D ; couture stable ; faible mouvement résiduel ; drapé réaliste vérifié visuellement.

## Dernier essai : repos 3D posé comme Blender

La première variante de simulation implicite sur un maillage au repos **3D cousu** a été exécutée sur 130 étapes : la proportion d'arêtes fortement déformées est passée de **1,10 %** au départ à **24,17 %** après 130 étapes, avec déplacement médian résiduel d'environ **2,37 mm/étape**. Elle est **rejetée**. Une seconde variante a atteint l'étape 90 avec environ **16,26 %** d'arêtes anormales avant l'interruption de la campagne à la limite de durée ; elle n'est **pas considérée comme validée**. Ce résultat confirme que le préajustement seul ne résout pas la dynamique textile.
