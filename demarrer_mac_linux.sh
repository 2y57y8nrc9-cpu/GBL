#!/usr/bin/env bash
cd "$(dirname "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 introuvable. Installe Python 3.10+ depuis python.org."
  exit 1
fi
if [ ! -x .venv/bin/python ]; then
  echo "Création de l'environnement Python local..."
  python3 -m venv .venv || { echo "Impossible de créer l'environnement (module venv manquant)."; exit 1; }
fi
.venv/bin/python launch.py
