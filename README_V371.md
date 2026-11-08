# Garment Bending Lab V3.7.1 — correction du banc de validation

## Conclusion sur `blender-10.log`

Blender **termine** 108 frames mais **n'obtient pas un vêtement valide**. Le patron n'est pas trop petit pour l'avatar MPFB d'après l'estimation géométrique disponible (corsage 108 cm, torse 87,12 cm estimés). Le maillage soudé compte une composante connectée, mais le résultat diverge physiquement.

- Arêtes fortement déformées par rapport au patron 2D : 1,18 % avant simulation, 13,88 % après.
- Expansion verticale : ×3,55 (0,658 m → 2,3353 m d'étendue spatiale).
- Triangles en intersection potentielle tissu/corps : 54 paires, impliquant 4 faces du tissu.
- Déplacement moyen sur les fenêtres finales de six frames : 2,26 cm, 1,52 cm et 1,98 cm.
- Verdict : drapé **rejeté** ; les coutures à zéro indiquent seulement une topologie soudée.

## Modifications de cette version

1. **Les six essais sont maintenant réellement différents.** L'ancien orchestrateur définissait un poids de collision `collision_weight` et un indicateur `elastic` qui n'étaient pas utilisés dans l'optimiseur V3.7. Les nouveaux paramètres `GBL_PREFIT_WEIGHTS`, `GBL_PREFIT_EXPONENTS` et `GBL_PREFIT_CLEARANCES_MM` sont effectivement transmis à `search_pre_fit`. Ils sont validés et enregistrés dans les journaux. Le parcours normal sans variables personnalisées conserve la recherche à 18 candidats.
2. **Contrôle d'explosion verticale.** Une augmentation de l'étendue verticale du vêtement dépassant ×1,7 est explicitement rejetée, même si les coutures restent fusionnées.
3. **Analyse de journaux hors Blender.** `analyser_log_blender.py` produit un résumé Markdown et JSON d'un ancien journal Blender sans relancer la physique.
4. **Tests de régression.** Exécution vérifiée des options du runner et détection des métriques de la simulation fournie.

### Comment lancer le banc automatique sur Mac

Ouvrir Terminal dans le dossier V3.7.1 :

```bash
bash VALIDATION_AUTOMATIQUE.command
```

Le banc recherche l'avatar MPFB déjà généré par GBL, ou essaie de le générer avec l'extension installée, puis exécute ses variantes et ouvre le rapport comparatif. **Aucun résultat n'est déclaré valide sans satisfaire les critères numériques**. Les variantes restent des expériences, pas un remplacement du solveur Blender Cloth.

Pour analyser un log existant sans Blender :

```bash
python3 analyser_log_blender.py /chemin/vers/blender-10.log
```

L'outil écrit `blender-10_analyse.json` et `blender-10_analyse.md` à côté du log.

## Ce que V3.7.1 ne corrige PAS encore

La V3.7 utilise toujours, avec des sommets partagés entre panneaux, **le maillage 3D cousu comme forme de repos du modificateur Cloth**. Les longueurs du patron 2D sont utilisées pour optimiser la pose initiale puis contrôler le résultat, mais **elles ne deviennent pas toutes des contraintes physiques indépendantes dans Blender**. C'est une limite de conception majeure qui peut expliquer la perte de fidélité sous gravité.

Pour obtenir un résultat de qualité type CLO3D, il faudra soit concevoir un solveur supportant les métriques de repos 2D par triangle sur une topologie soudée, soit implémenter une procédure de couture de panneaux disjoints avec contraintes de repos 2D conservées à chaque pas. Ni l'une ni l'autre n'est implémentée et validée ici.

### Validation effectuée

- 155 tests pytest réussis, 5 sous-tests.
- Vérification syntaxique des scripts.
- Analyse automatique du journal `blender-10.log` exécutée et résultat « rejeté » reproduit.
- Pas de simulation Blender/MPFB effectuée dans cet environnement (exécutable absent).

**Une exécution du moteur Blender sur un Mac possédant Blender et MPFB est encore nécessaire.** Cette version fiabilise la recherche et le diagnostic, pas la dynamique physique en elle-même.
