#!/usr/bin/env python3
"""Robust local launcher for Garment Bending Lab. No extra packages required to start checks."""
import sys, os, subprocess, socket, time, threading, urllib.request, webbrowser, traceback
from pathlib import Path
ROOT=Path(__file__).resolve().parent
os.chdir(ROOT)

def ensure_deps():
    try:
        import fastapi, uvicorn, pydantic
        return
    except ImportError:
        print("[1/3] Installation des dépendances Python (une connexion Internet est nécessaire)...", flush=True)
        cmd=[sys.executable,'-m','pip','install','-r',str(ROOT/'requirements.txt')]
        result=subprocess.run(cmd,check=False)
        if result.returncode:
            raise RuntimeError("Échec de l’installation Python. Vérifie ta connexion et les lignes d’erreur ci-dessus. Commande manuelle : python -m pip install -r requirements.txt")

def existing_app(port):
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/catalog',timeout=1) as r:
            return r.status == 200 and 'application/json' in r.headers.get('Content-Type','')
    except Exception: return False

def available_port():
    for p in range(8765,8776):
        sock=socket.socket()
        try:
            sock.bind(('127.0.0.1',p))
            return p,False
        except OSError:
            # Do not attach to a different (possibly outdated) Garment Lab server.
            # Pick a free port and start THIS version instead.
            continue
        finally: sock.close()
    raise RuntimeError('Les ports 8765 à 8775 sont occupés. Ferme les anciens serveurs ou libère un port.')

def open_when_ready(url):
    for _ in range(80):
        time.sleep(0.25)
        try:
            with urllib.request.urlopen(url+'/api/catalog',timeout=1) as r:
                if r.status==200:
                    print(f"\n✓ Garment Bending Lab disponible : {url}",flush=True)
                    if '--no-browser' not in sys.argv:
                        webbrowser.open(url)
                    return
        except Exception: pass

if __name__=='__main__':
    print('=== Garment Bending Lab V3.2 — Avatar + paires avant/après ===',flush=True)
    print('Python:',sys.version.split()[0], '|',sys.executable,flush=True)
    try:
        if sys.version_info < (3,10): raise RuntimeError('Python 3.10 ou supérieur requis. Installe une version récente depuis python.org.')
        ensure_deps()
        port,already=available_port()
        url=f'http://127.0.0.1:{port}'
        if already:
            print('Serveur Garment Bending Lab déjà actif :',url,flush=True)
            if '--no-browser' not in sys.argv: webbrowser.open(url)
        else:
            print('[2/3] Dépendances OK',flush=True)
            print('[3/3] Démarrage du serveur local :',url,flush=True)
            print('Garde ce terminal ouvert pendant l’utilisation. Ctrl+C pour arrêter.\n',flush=True)
            threading.Thread(target=open_when_ready,args=(url,),daemon=True).start()
            import uvicorn
            from server import app
            uvicorn.run(app,host='127.0.0.1',port=port,log_level='info')
    except KeyboardInterrupt:
        print('Serveur arrêté.',flush=True)
    except Exception as exc:
        print('\n❌ Impossible de démarrer :',exc,flush=True)
        traceback.print_exc()
        print('\nDiagnostic: exécute ce lanceur depuis un terminal puis copie les dernières lignes de l’erreur.',flush=True)
        sys.exit(1)
