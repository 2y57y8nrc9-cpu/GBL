#!/usr/bin/env bash
cd "$(dirname "$0")" || exit 1
./demarrer_mac_linux.sh
code=$?
echo
if [ "$code" -ne 0 ]; then echo "Erreur de démarrage : $code. Copie les lignes ci-dessus."; fi
read -r -p "Appuie sur Entrée pour fermer cette fenêtre... " _
exit "$code"
