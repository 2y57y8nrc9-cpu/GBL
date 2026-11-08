# Garment Bending Lab (GBL) — V3.7.1

**Prototype expérimental de patronage, mutation et simulation de vêtements.**

Ce dépôt contient le **code source important**, les patrons JSON, les tests et
les scripts nécessaires au développement sur macOS Apple Silicon avec Blender
et MPFB. Les archives des anciennes versions, caches et résultats de calcul
ont été exclus pour garder un dépôt lisible.

> **État réel :** le préassemblage d'un T-shirt est opérationnel sur les cas
> testés, mais **le drapé physique Blender n'est pas validé**. Les derniers
> résultats montrent des déformations, pénétrations résiduelles et oscillations.
> Ne pas présenter cette version comme un vêtement simulé fiable.

## Organisation

- `garmentlab/` — géométrie des patrons, couture, mesures, préajustement, MPFB, mutations.
- `mac_simulation/` — scripts Blender et génération d'avatar MPFB.
- `frontend_v3/` — interface principale du projet.
- `frontend/`, `legacy/` — interfaces et fonctions historiques **encore référencées par le serveur** ; ne pas supprimer sans migration.
- `patrons_json/` — patrons d'exemple, dont `01_tshirt_regular_specification.json`.
- `tests/` — tests automatiques, sans preuve de drapé physique.
- `tools/` — outils et scripts annexes.
- `auto_validation.py` — comparaison de plusieurs essais Blender sur le même patron.
- `analyser_log_blender.py` — lecture hors ligne d'un log de simulation.
- `*_experiment.py`, `*validation.py`, `benchmark_geometrique.py`, etc. — recherches et tests géométriques sur corps synthétique.

## Lancer GBL sur Mac

Python 3.10+ et Blender avec MPFB installé pour les fonctions 3D :

```bash
python3 -m pip install -r requirements.txt
python3 launch.py
```

Ou `bash demarrer_mac_linux.sh` (lanceur local). L'application est servie sur
`127.0.0.1` ; ne pas l'exposer publiquement sans authentification.

Pour les dépendances supplémentaires des outils d'étude :

```bash
python3 -m pip install -r requirements-research.txt
```

## Tests de code (ne lancent pas Blender)

```bash
python3 -m pip install -r requirements-research.txt
python3 -m pytest -q
```

## Campagne Blender / MPFB sur Mac

Installer Blender/MPFB puis lancer :

```bash
bash VALIDATION_AUTOMATIQUE.command
```

Cette campagne peut échouer : **un résultat terminé n'est pas un vêtement validé**.
Lire [README_V371.md](README_V371.md) pour les critères et les limites.

## Reprendre le développement avec Codex

Lire [AGENTS.md](AGENTS.md). Le jalon prioritaire est un T-shirt régulier
fidèle au patron JSON et physiquement stable sur avatar MPFB.

## Données non incluses

Les avatars utilisateurs, les images avant/après, les fichiers `.blend`, les
résultats `.obj`, les caches, les logs et les rendus générés ne sont pas fournis.
Ils doivent rester locaux ou être gérés dans un espace de stockage adapté.
