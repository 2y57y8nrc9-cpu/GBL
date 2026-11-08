# Instructions de développement pour Codex / agents

## Priorité

Stabiliser **un T-shirt témoin** sur un avatar MPFB avant toute fonctionnalité
nouvelle. Patron : `patrons_json/01_tshirt_regular_specification.json` ;
corsage 108 cm ; avatar 174 cm ; 4 panneaux, 10 coutures déclarées.

## Contexte

Python, Blender 5.2.3/MPFB sur macOS Apple Silicon M1. Le moteur actuel utilise
une coque de couture soudée en 3D comme forme de repos Blender Cloth : les
métriques 2D sont contrôlées mais pas complètement imposées pendant le calcul.
Le dernier drapé observé dans `blender-10.log` a **échoué** : 13,88 % d'arêtes
fortement déformées après simulation, instabilité et contacts géométriques
indésirables. Le fichier log utilisateur n'est pas inclus ici.

## Règles

1. Auditer les causes avant d'augmenter les seuils de qualité.
2. Garder les dimensions du JSON source inchangées, sans correction silencieuse.
3. Préserver les coutures fermées et les bras dans leurs manches.
4. Tester la topologie, les distances corporelles et les métriques 2D.
5. Pour valider la physique, exécuter réellement Blender/MPFB, inspecter les
   dernières frames et des rendus multi-vues, et mesurer l'oscillation.
6. Ne jamais confondre `pytest` réussi, prépositionnement statique et drapé
   physique valide. Dire explicitement si Blender est indisponible.
7. Éviter de modifier `frontend/` et `legacy/` sans vérifier les routes serveur.
8. Ne pas versionner `runs/`, avatars, cache, rapports générés ou photos privées.
9. Produire des correctifs ciblés avec des tests de régression reproductibles.

## Vérifications de base

```bash
python3 -m pip install -r requirements-research.txt
python3 -m pytest -q
python3 -m compileall -q garmentlab mac_simulation
```

## Vérification du drapé (sur un Mac équipé de Blender/MPFB)

```bash
bash VALIDATION_AUTOMATIQUE.command
```

Si aucun candidat n'atteint les critères : déclarer `AUCUN DRAPÉ VALIDÉ`,
conserver les mesures et proposer/implémenter la correction de conception.
