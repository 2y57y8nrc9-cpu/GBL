# Bibliothèque de 14 patrons JSON — Garment Bending Lab V2

Chaque fichier `*_specification.json` utilise le schéma **GarmentCode** (panneaux, boucles orientées, placement initial et coutures explicites). Les fichiers ont été produits spécialement pour Garment Bending Lab : ils ne sont pas extraits du corpus GarmentCodeData et leurs coupes ne sont pas physiquement validées.

| N° | Fichier | Genre | Intérêt expérimental |
|---:|---|---|---|
| 01 | `01_tshirt_regular_specification.json` | Haut | Emmanchures / manches liées |
| 02 | `02_tshirt_oversize_specification.json` | Haut | Déformations du volume et ampleur |
| 03 | `03_cropped_top_specification.json` | Haut | Rupture d'ourlet et raccourcissement |
| 04 | `04_debardeur_specification.json` | Haut | Emmanchures ouvertes |
| 05 | `05_tunique_asymetrique_specification.json` | Haut | Ourlet dissymétrique contrôlé |
| 06 | `06_robe_tshirt_specification.json` | Robe | Corsage allongé / silhouette complète |
| 07 | `07_jupe_droite_specification.json` | Jupe | Rapports taille-hanche |
| 08 | `08_jupe_trapeze_specification.json` | Jupe | Évasement et drapé potentiel |
| 09 | `09_jupe_asymetrique_specification.json` | Jupe | Déséquilibre des longueurs |
| 10 | `10_pantalon_droit_specification.json` | Pantalon | Entrejambe et symétrie |
| 11 | `11_pantalon_large_specification.json` | Pantalon | Grands volumes et articulations |
| 12 | `12_short_structural_specification.json` | Pantalon | Panneaux courts et bassin |
| 13 | `13_sarouel_bas_specification.json` | Pantalon | Fourche abaissée expérimentale |
| 14 | `14_tunique_sans_manches_specification.json` | Haut | Surfaces architecturales |

## Démarrage recommandé

Commencer avec `01_tshirt_regular` à 20 % de corruption, puis `11_pantalon_large` à 45 %, puis `05_tunique_asymetrique` à 70 %. Comparer les coutures avant/après. **Ne pas imprimer à taille réelle directement depuis le SVG de visualisation** : il est destiné à l'écran, pas à la coupe.

## Pourquoi des JSON structurés plutôt que des PDF ?

Le PDF vectoriel contient des tracés sans nécessairement décrire les couples de coutures. Dans les fichiers GarmentCode, `pattern.stitches` explicite les relations `panel + edge → panel + edge`, ce qui permet d'ajuster une manche lorsqu'on modifie l'emmanchure correspondante. Cela reste une topologie géométrique : seules une simulation physique et une validation en toile peuvent attester de la réalisabilité.
