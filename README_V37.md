# GBL V3.7 — Auto-vérification, préassemblage et physique expérimentale

**Statut : prototype de recherche. Le T-shirt stable sur MPFB n'a pas encore été validé physiquement.**

## Modifications

- Optimiseur de pré-ajustement **multi-candidats**, avec 18 variantes et sélection automatique du candidat qui respecte le mieux le patron JSON et les contacts avec le corps.
- Suppression de la projection brutale sur la peau **après** la relaxation élastique quand la recherche est active.
- Mesure des intersections **triangles du tissu / peau du corps** par BVH, complémentaire aux tests sur sommets.
- Rejet de la physique avant simulation en cas de forte déformation initiale du patron 2D ou de pénétrations détectées.
- Rapport de recherche sauvegardé comme `rapport_preajustement_automatique.json` dans chaque dossier Blender.
- Distinction entre calcul terminé et drapé effectivement valide dans `rapport_couture.json`.
- Banc de tests et exemples géométriques et dynamiques sur **mannequin synthétique uniquement**.

## Lancement sur Mac équipé de Blender et MPFB

Décompresser puis lancer `VALIDATION_AUTOMATIQUE.command` depuis Finder (ou `bash VALIDATION_AUTOMATIQUE.command` dans Terminal). Le banc réutilise l'avatar MPFB disponible localement, ou essaie de le générer, puis compare six simulations sans nouvelle intervention. Rapport final sous `runs/validation_auto/<date>/rapport_comparatif.html`.

**Attention : cette exécution n'est pas reproduite sur ton Mac depuis cette session.** Le lancement est une vérification réelle à exécuter là où Blender est installé, pas un résultat déjà obtenu.

## Développement / vérifications sans Blender

Depuis le dossier du projet :

```bash
python3 -m pytest -q
python3 test_auto_fit_synthetic.py
python3 render_research.py
```

Les deux derniers scripts utilisent un modèle corporel **synthétique**, non l'avatar MPFB et ne réalisent pas de simulation physique Blender.

Fichiers pertinents : `garmentlab/auto_fit.py`, `garmentlab/elastic_refit.py`, `mac_simulation/blender_sewn_garment.py`, `auto_validation.py` et `RAPPORT_AUTOVERIFICATION_V37.md`.

## Limitation structurelle toujours ouverte

Une topologie cousue ne peut pas facilement posséder une seule *Rest Shape Key Blender* correspondant à plusieurs cartes de patron 2D : les deux panneaux adjacents ont chacun leurs propres coordonnées matérielles au niveau d'une couture. Notre pré-ajustement réduit les écarts mais le moteur Cloth classique conserve comme repos la géométrie 3D cousue. **Un solveur intrinsèque au patron 2D ou un couplage textile plus robuste sera nécessaire pour viser un véritable niveau CLO3D** sans tensions inventées.
