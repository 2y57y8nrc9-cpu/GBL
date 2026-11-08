#!/bin/bash
# Mesure les contours réels de l'avatar MPFB déjà généré, sans lancer Blender.
set -uo pipefail
cd "$(dirname "$0")" || exit 1
python3 diagnostic_mensurations.py "$@"
status=$?
echo ""
if [ "$status" -ne 0 ]; then echo 'Diagnostic non effectué : voir message ci-dessus.'; fi
echo 'Appuyer sur Entrée pour fermer.'
read -r _ || true
exit "$status"
