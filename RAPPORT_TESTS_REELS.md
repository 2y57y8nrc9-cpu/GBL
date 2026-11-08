# GBL V3.6 : état réel des vérifications

| Domaine | Mesure | État |
|---|---|---|
| Tests Python | 121 tests pytest | Exécutés, réussis |
| Patrons 2D et coutures | 4 panneaux, correspondances, longueurs 2D | Exécutés sur patrons de test |
| Fusion topologique | 2 niveaux minimum, une seule composante manifold pour le T-shirt de test | Exécutée avec avatar synthétique |
| Placement de manches | Vertical / suivant bras en pose A | Comparés hors Blender |
| Pré-positionnement élastique | Six couples pose/poids de contact | Exécutés sur avatar synthétique |
| Pénétration géométrique | 0,11 % pour un scénario synthétique (arrangement guidé, poids 4000) | Estimation, hors physique |
| Déformation 2D du même scénario | 3,56 % d'arêtes avec ratio inférieur à 0,65 ou supérieur à 1,50 | Estimation, hors physique |
| Morphologie MPFB réelle | Rien de livré ici à mesurer directement | NON exécuté |
| Blender Cloth 5.2.3 | Gravité + collisions réelles + couture + comportement temporel | NON exécuté |
| T-shirt stable et enfilé en Blender | Drape sans tremblement | NON validé |
| Équivalence CLO3D | Qualité de drapé comparative | NON validée |

**Pourquoi ne pas annoncer la réussite ?** Les objets obtenus par triangulation et pré-placement peuvent sembler corrects tout en s'écroulant lors de la dynamique. Sans Blender et l'avatar MPFB réel, un verdict physique serait inventé.

La campagne `VALIDATION_AUTOMATIQUE.command` reprend ces critères sur le Blender installé localement, sans imposer six allers-retours manuels. Si aucun candidat ne satisfait toutes les barrières, elle le dit explicitement.
