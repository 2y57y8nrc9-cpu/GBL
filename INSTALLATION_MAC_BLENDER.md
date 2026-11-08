# Simulation 3D macOS : Blender Cloth, et non GarmentCode officiel

Tu as vérifié `warp-lang` en CPU sur ton Mac Apple M1. Le bandeau « GarmentCode officiel non configuré » de V2 est normal : le code vérifie le dépôt GarmentCode, son `system.json`, son script `test_garment_sim.py` et une configuration YAML. `pip install warp-lang` ne fournit aucun de ces fichiers.

## Installer Blender

1. Installer Blender depuis https://www.blender.org/download/ (version Apple Silicon).
2. Vérifier dans Terminal :

```bash
/Applications/Blender.app/Contents/MacOS/Blender --version
```

Si Blender est installé ailleurs, fournir son exécutable :

```bash
export GBL_BLENDER_BIN="/chemin/vers/Blender.app/Contents/MacOS/Blender"
```

## Lancer l'interface

Dans le dossier de la V2.0.3, depuis Terminal :

```bash
export GBL_WARP_PYTHON="$HOME/GarmentLab-Simulation/.venv/bin/python"
bash demarrer_mac_linux.sh
```

Ouvrir l'adresse indiquée par Terminal. Le nouveau panneau **SIMULATION macOS / BLENDER (ALTERNATIVE)** doit indiquer « Warp CPU fonctionne » et « Blender disponible » si les deux sont reconnus. En cas de changement des variables d'environnement, quitter puis relancer le serveur.

Choisir le T-shirt régulier, cliquer « Générer une mutation » si souhaité, puis « Tester le drapé d’un panneau sur mannequin ». Le serveur appelle Blender en arrière-plan, qui sélectionne uniquement le panneau de devant, le triangule, le place verticalement, épingle son bord supérieur et calcule 55 images sous gravité face à un buste simplifié. Une sortie `.obj` et un `.blend` sont créés et téléchargeables.

### Limites importantes

- Un seul panneau est simulé. Aucun assemblage de manches, emmanchures, côtés ni col.
- Les unités des 14 patrons originaux sont traitées comme des **centimètres** ; pas de conversion automatique de toutes les spécifications tierces.
- Ce test physique ne valide pas le confort, la confection, la tension des coutures ou le tombé réaliste d'un vêtement.
- Le moteur de Blender est indépendant de NVIDIA Warp standard et du fork CUDA GarmentCode. Voir `INSTALLATION_GARMENTCODE.md` pour la branche Linux NVIDIA.
- Selon la version de Blender, certains paramètres de simulation peuvent nécessiter adaptation.
- Le test est asynchrone, mais son résultat n'est produit **que lorsque l'application locale est en fonctionnement**, pas dans cette conversation.

## Problèmes fréquents

- « Blender indisponible » : vérifier la commande `.../Blender --version`, puis relancer le serveur.
- « Warp CPU non détecté » : vérifier `~/GarmentLab-Simulation/.venv/bin/python -c 'import warp as wp; wp.init(); print(wp.get_device("cpu"))'`.
- « Échec Blender » : ouvrir le lien Journal et examiner la dernière erreur.
