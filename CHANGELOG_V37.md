# Changelog V3.7

- Correctif majeur du pré-placement : optimisation simultanée des longueurs 2D, collisions, ancrages et maintien de l'identité des panneaux.
- Recherche automatique multi-critères sur 18 combinaisons, avec pondération par tailles d'arêtes et rejet explicite.
- Plus de projection locale du tissu après un pré-placement optimisé accepté.
- Rapport de recherche JSON par simulation Blender.
- Contrôle expérimental des collisions triangle-peau par BVH Blender.
- Statut `success` aligné avec le contrôle qualité physique, non avec la simple fin des frames.
- 130 tests Python réussis ; essais CPU synthétiques physiques et géométriques documentés ; aucune simulation réelle Blender/MPFB disponible dans cet environnement.
- Problème de drapé définitif **non résolu / non validé**.
