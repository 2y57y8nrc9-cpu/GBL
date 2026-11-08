# Garment Bending Lab V2.0.6 — Premier T-shirt cousu dans Blender

Cette version ajoute une **expérience de couture physique multi-panneaux** à la simulation de panneau unique qui fonctionne déjà chez toi.

## Ce qui est simulé

- Quatre panneaux séparés : corsage devant, corsage dos, deux manches.
- Dix paires de coutures **déjà déclarées dans le JSON**.
- Maillage triangulé et affiné, avec ressorts de couture Blender (`ClothSettings.use_sewing_springs`).
- Gravité, mannequin simplifié avec collision et deux points d'encolure maintenus pour stabiliser le prototype.
- Rapport des distances entre sommets reliés avant/après simulation.
- Exports : `tshirt_cousu.obj`, `atelier_tshirt_cousu.blend`, `rapport_couture.json`.

Ce n'est **pas** encore un T-shirt aux coutures topologiquement soudées, calibré pour un tissu réel, ni un rendu CLO3D. Une faible distance entre ressorts ne prouve pas que le vêtement soit réalisable. Ce premier solveur n'infère pas les coutures depuis un PDF arbitraire.

## Comment démarrer sur macOS

1. Décompresser **Garment-Bending-Lab-V2.0.6-Sewn-Tshirt.zip** dans Téléchargements.
2. Dans le Terminal de l'ancienne version, arrêter le serveur avec `Ctrl + C`.
3. Ouvrir un nouveau Terminal, taper `cd ` (avec l'espace), faire glisser le **nouveau dossier** dans Terminal, puis Entrée.
4. Exécuter `bash demarrer_mac_linux.sh`.
5. Ouvrir l'adresse indiquée par Terminal, souvent http://127.0.0.1:8765.
6. Choisir **T-shirt classique**, conserver d'abord le patron original.
7. Dans la partie droite **Simulation macOS / Blender**, cliquer **Assembler et simuler le T-shirt cousu (4 panneaux)**.
8. Lorsque le travail se termine, télécharger `OBJ` pour aperçu ou le `.blend` pour ouvrir le résultat et inspecter les ressorts/collisions dans Blender.

**Ne lance pas ce premier test avec une mutation extrême.** Commence par le T-shirt original, puis par une mutation subtile de 10 à 20 %.

## Si Blender affiche une erreur

Cliquer **Journal** dans le résultat du job et copier les dernières lignes, avec ton modèle Blender (tu utilises Blender 5.2.3 LTS). Ne réinstaller ni Warp ni Python : cette étape utilise Blender Cloth, pas le fork CUDA de GarmentCode.

## Critères de réussite

- La simulation atteint la frame 72.
- `rapport_couture.json` indique 4 panneaux et 10 paires de coutures.
- Le `.blend` contient un objet nommé **T-shirt · panneaux cousus par ressorts** avec un modificateur **Coutures + tissu physique**.
- La distance moyenne finale des paires de coutures diminue par rapport à la distance initiale (si ce n'est pas le cas, le rapport le signale).
- Les surfaces ne traversent pas massivement le corps et ne s'effondrent pas. Cette dernière vérification doit être faite visuellement : le script ne la certifie pas.

## Limites

Les positions initiales sont adaptées à un T-shirt construit en 4 panneaux. Des vêtements comme un pantalon ou une veste complexe demandent d'autres placements sur le corps et des règles de simulation supplémentaires. Les courbes sont approchées par des segments, puis remeshing. Les ressorts rapprochent des bords mais ne forment pas une couture définitive ; le résultat est un prototype de recherche.


### Correctif V2.0.7 — sommet invalidé au remeshing

Les anciennes versions raffinaient le maillage via `bmesh.ops.subdivide_edges`,
ce qui pouvait supprimer ou recréer des sommets référencés par les coutures.
La V2.0.7 fait dorénavant la subdivision **avant** la création du maillage
Blender, conserve tous les indices d'origine et coud aussi les milieux des bords.
Le lancement reste identique : **Assembler et simuler le T-shirt cousu**.
Cherche `GBL_SEWN_MESH_READY` puis `GBL_SEWN_GARMENT_COMPLETE` dans le journal.
Le second message nécessite un test réel dans Blender 5.2 sur ton Mac ;
il n'est pas garanti par les tests Python seuls.
