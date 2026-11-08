#!/usr/bin/env python3
"""Preflight for a previously generated MPFB body OBJ, no Blender required.

Usage: python3 diagnostic_mensurations.py [path/to/avatar.obj]
If omitted, use the newest saved avatar from GBL runs/avatars.
"""
from pathlib import Path
import json
import sys
from garmentlab.anthropometry import estimate_avatar_girths, compare_pattern_bodice_to_avatar
from garmentlab.avatar_registration import body_landmarks

ROOT=Path(__file__).resolve().parent

def read_obj(path):
    vertices=[];faces=[]
    with path.open(encoding='utf8',errors='ignore') as stream:
        for line in stream:
            if line.startswith('v '):
                values=line.split()
                if len(values)>=4:vertices.append(tuple(map(float,values[1:4])))
            elif line.startswith('f '):
                face=[]
                for token in line.split()[1:]:
                    n=int(token.split('/')[0]); idx=n-1 if n>0 else len(vertices)+n
                    if idx<0 or idx>=len(vertices):raise ValueError('Index de face OBJ invalide')
                    face.append(idx)
                if len(face)>=3:faces.append(face)
            if len(vertices)>300000 or len(faces)>600000:
                raise ValueError('OBJ anormalement volumineux')
    if len(vertices)<500 or len(faces)<500:raise ValueError('OBJ ne contient pas un corps humain complet')
    return vertices,faces

def run(path=None):
    if path is None:
        folder=ROOT/'runs'/'avatars'
        objects=sorted(folder.glob('*.obj'),key=lambda p:p.stat().st_mtime,reverse=True) if folder.exists() else []
        if not objects:raise RuntimeError('Aucun avatar MPFB dans runs/avatars. Générer un avatar dans GBL.')
        path=objects[0]
    path=Path(path).expanduser().resolve()
    vertices,faces=read_obj(path)
    landmarks=body_landmarks(vertices)
    measures=estimate_avatar_girths(vertices,landmarks['shoulder_estimate_z_m'],faces)
    fit=compare_pattern_bodice_to_avatar(108,measures,0.0)
    output=ROOT/'runs'/'diagnostic_mensurations.json'
    output.parent.mkdir(parents=True,exist_ok=True)
    report={'avatar_obj':str(path),'vertices':len(vertices),'faces':len(faces),
            'landmarks':landmarks,'measurements':measures,'fit_tshirt_108cm':fit,
            'caution':'Mesures sur sections de mesh; non certifiées par ruban de modéliste. '
                      'Ne modifie aucun patron et ne réalise pas de drapé.'}
    output.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    print('GBL_TORSO_SECTION_DIAGNOSTIC',json.dumps(report,ensure_ascii=False))
    print('Rapport enregistré :',output)
    return report

if __name__=='__main__':
    try:run(sys.argv[1] if len(sys.argv)>1 else None)
    except Exception as exc:
        print('GBL_DIAGNOSTIC_ERROR:',str(exc),file=sys.stderr)
        sys.exit(1)
