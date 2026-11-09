#!/bin/bash
# Double-click in Finder. Runs all simulations without manual repeated testing.
set -uo pipefail
cd "$(dirname "$0")" || exit 1
export PYTHONPATH="${PWD}:${PYTHONPATH:-}"
python3 auto_validation.py "$@"
status=$?
LATEST=$(find "${PWD}/runs/validation_auto" -name rapport_comparatif.html -type f 2>/dev/null | sort | tail -1)
if [ -n "${LATEST}" ]; then
  echo "Rapport : ${LATEST}"
  command -v open >/dev/null && open "${LATEST}"
fi
if [ "${status}" -ne 0 ]; then
  echo "ATTENTION : aucune validation complète, ou environnement indisponible (code ${status})."
fi
echo "Rapport et journaux conservés dans runs/validation_auto/."
echo "Entrée pour fermer."
read -r _ || true
exit "${status}"
