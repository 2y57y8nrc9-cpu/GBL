# Activer la simulation physique GarmentCode + NVIDIA Warp dans la V2

**Ce guide prépare une installation séparée. Rien n'est déjà installé / exécuté par le bouton tant que cette configuration manque.**

Les instructions viennent des dépôts officiels :
- https://github.com/maria-korosteleva/GarmentCode/blob/main/docs/Installation.md
- https://github.com/maria-korosteleva/GarmentCode/blob/main/docs/Running_garmentcode.md
- https://github.com/maria-korosteleva/NvidiaWarp-GarmentCode

## Pré-requis

- Environnement Python compatible avec GarmentCode (les instructions du projet citent Python 3.9 et `numpy<2`). Ne pas supposer que ton environnement Python V2 moderne peut installer les mêmes versions sans conflit.
- GPU NVIDIA/CUDA conseillé pour la simulation complète ; le fork de Warp exige des outils de compilation et des bibliothèques spécifiques.
- CUDA Toolkit compatible, compilateur C++ (GCC / Visual Studio selon OS), `git` et `git-lfs`.
- Les fichiers d'avatar et la configuration de simulation (`sim_props`) exigés par GarmentCode ; certains se téléchargent séparément.

## Étape A — dépôt GarmentCode

```bash
git clone https://github.com/maria-korosteleva/GarmentCode.git
cd GarmentCode
# Suivre la documentation officielle et créer son environnement Python
python -m pip install -e .
```

Créer `system.json` à partir de `system.template.json` et renseigner ses chemins absolus (`output`, `datasets_path`, `bodies_default_path`, `sim_configs_path`, etc.). Suivre les étapes spécifiques de l'auteur pour les body models.

## Étape B — installer leur fork de NVIDIA Warp

```bash
git clone https://github.com/maria-korosteleva/NvidiaWarp-GarmentCode.git
cd NvidiaWarp-GarmentCode
python build_lib.py
python -m pip install -e .
```

**Important :** il s'agit du fork officiel de GarmentCode basé historiquement sur Warp 1.0.0-beta.6, pas d'une garantie de compatibilité avec `pip install warp-lang` dernière version.

## Étape C — tester d'abord le simulateur officiel directement

Dans la racine GarmentCode :

```bash
python test_garment_sim.py \
  -p /chemin/vers/Garment-Bending-Lab-V2/patrons_json/01_tshirt_regular_specification.json \
  -s /chemin/vers/GarmentCode/assets/Sim_props/default_sim_props.yaml
```

Vérifier les erreurs éventuelles et le fichier de sortie dans `system.json` → `output`. Les exemples V2 sont des patrons de recherche et ne sont pas garantis compatibles avec toutes les versions ni physiquement valides.

## Étape D — connecter la V2 au moteur officiel

Sous macOS/Linux (adapter les chemins) :

```bash
export GBL_GARMENTCODE_DIR="/chemin/vers/GarmentCode"
export GBL_SIM_CONFIG="/chemin/vers/GarmentCode/assets/Sim_props/default_sim_props.yaml"
export GBL_PYTHON="/chemin/vers/ton/environnement/garmentcode/bin/python"
python server.py
```

Sous Windows PowerShell :

```powershell
$env:GBL_GARMENTCODE_DIR="C:\chemin\GarmentCode"
$env:GBL_SIM_CONFIG="C:\chemin\GarmentCode\assets\Sim_props\default_sim_props.yaml"
$env:GBL_PYTHON="C:\chemin\env\Scripts\python.exe"
python server.py
```

Ouvrir http://127.0.0.1:8765 → choisir un JSON → muter → cliquer sur **Lancer la simulation officielle**.

## Ce qui se passe techniquement

1. La V2 enregistre un nouveau `*_specification.json` dans `runs/<job-id>/`.
2. Le backend lance `test_garment_sim.py -p ... -s ...` dans le dépôt officiel, dans un processus séparé.
3. La V2 conserve son journal et détecte certains fichiers `.obj` ajoutés dans le dossier `output` de GarmentCode.
4. Si un OBJ est détecté, l'interface peut afficher un aperçu 3D échantillonné et proposer le téléchargement du fichier.
5. Si aucune sortie OBJ n'est détectée, vérifier les dossiers du dépôt GarmentCode, les images, les USD et les autres formats de rendu.

**L'absence de message d'erreur ne signifie pas que le vêtement est cousable.** Pour les résultats dangereux ou peu plausibles, effectuer une toile ou contacter une personne formée au patronage.
