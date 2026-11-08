#!/usr/bin/env python3
"""GBL automatic macOS Blender experiment runner.

This runs real Blender processes sequentially.  The result is deliberately
marked NOT VALIDATED until quantitative acceptance gates pass.  No fake/stock
frames, static previews or geometry-only checks are counted as simulation.

Usage: python3 auto_validation.py [--avatar /path/avatar.obj]
"""
from __future__ import annotations
import argparse
import datetime as dt
import html
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import traceback

ROOT=Path(__file__).resolve().parent
RUNNER=ROOT/'mac_simulation'/'blender_sewn_garment.py'
PATTERN=ROOT/'patrons_json'/'01_tshirt_regular_specification.json'

# All experiments use the *same* JSON pattern + MPFB body. Parameter search
# is not allowed to resize the pattern to hide a fitting failure.
CONFIGS=[
    dict(name='reference_old_placement', sleeve='legacy', arrangement='legacy', max_shift=.06, frame=120, quality=10, collision_quality=8,
         mass=.040, tension=40, compression=35, shear=20, bend=.60, air=2, gap=.008, self_collision=1, clearance=.018),
    dict(name='anatomical_elastic_damped', sleeve='a_pose', arrangement='body_volumes', max_shift=.035, frame=144, quality=12, collision_quality=10,
         mass=.035, tension=50, compression=42, shear=26, bend=.90, air=6, gap=.009, self_collision=1, clearance=.018),
    dict(name='legacy_elastic_soft', sleeve='a_pose', arrangement='legacy', max_shift=.06, frame=144, quality=12, collision_quality=10,
         mass=.040, tension=30, compression=32, shear=16, bend=.55, air=5, gap=.010, self_collision=1, clearance=.018),
    dict(name='anatomical_elastic_contact', sleeve='a_pose', arrangement='body_volumes', max_shift=.06, frame=144, quality=12, collision_quality=12,
         mass=.030, tension=48, compression=44, shear=25, bend=.85, air=5, gap=.012, self_collision=1, clearance=.025),
    dict(name='anatomical_low_mass', sleeve='a_pose', arrangement='body_volumes', max_shift=.09, frame=144, quality=12, collision_quality=12,
         mass=.022, tension=54, compression=45, shear=30, bend=1.10, air=5, gap=.009, self_collision=1, clearance=.018),
    dict(name='diagnostic_self_collision_off', sleeve='legacy', arrangement='legacy', max_shift=.06, frame=132, quality=10, collision_quality=9,
         mass=.030, tension=42, compression=40, shear=24, bend=.9, air=5, gap=.008, self_collision=0, clearance=.018),
]


# Each variant selects specific material-aware pre-fit weights/exponents.
# These values are now passed into Blender's real search_pre_fit(); previously
# collision_weight and elastic labels did not change that 18-candidate search.
_PREFIT_BY_VARIANT = {
    'reference_old_placement': ('30000', '1', '15'),
    'anatomical_elastic_damped': ('30000', '1', '15'),
    'legacy_elastic_soft': ('30000', '0', '10,15'),
    'anatomical_elastic_contact': ('30000', '2', '10,15'),
    'anatomical_low_mass': ('30000', '1', '10'),
    'diagnostic_self_collision_off': ('30000', '0', '15'),
}
for _cfg in CONFIGS:
    (_cfg['prefit_weights'], _cfg['prefit_exponents'],
     _cfg['prefit_clearances_mm']) = _PREFIT_BY_VARIANT[_cfg['name']]

def assert_config_is_effective(cfg):
    from garmentlab.prefit_runtime import prefit_settings
    settings=prefit_settings({
        'GBL_PREFIT_WEIGHTS':cfg['prefit_weights'],
        'GBL_PREFIT_EXPONENTS':cfg['prefit_exponents'],
        'GBL_PREFIT_CLEARANCES_MM':cfg['prefit_clearances_mm'],
    })
    assert settings['weights'] and settings['clearances'] and settings['relative_stiffness_exponents']
    return settings


def find_blender(explicit=None):
    possible=[explicit,os.environ.get('GBL_BLENDER_BIN'),'/Applications/Blender.app/Contents/MacOS/Blender',shutil.which('blender')]
    for path in possible:
        if path and Path(path).is_file() and os.access(path,os.X_OK):return Path(path)
    raise RuntimeError('Blender introuvable. Installer Blender et relancer le test automatique. Aucune simulation n’a été exécutée.')


def valid_avatar(path):
    """OBJ check guards against 3-vertex placeholder files in old artifacts."""
    try:
        p=Path(path)
        if not p.is_file() or p.stat().st_size<40000:return False
        vertices=faces=0
        with p.open(encoding='utf8',errors='ignore') as file:
            for line in file:
                if line.startswith('v '):vertices+=1
                if line.startswith('f '):faces+=1
        return vertices>=500 and faces>=500
    except OSError:
        return False


def generate_avatar_mpfb(blender, out, height_cm=174.0, threads=4):
    """Generate MPFB automatically if GBL has no existing avatar yet.

    Requires the locally installed Blender MPFB extension. No OBJ is requested
    from the user and no downloaded body is bundled.
    """
    from garmentlab.mpfb_auto import normalize_parameters
    params=normalize_parameters({'height_cm':height_cm})
    folder=out/'avatar_mpfb_automatique'
    folder.mkdir(parents=True,exist_ok=True)
    parameters=folder/'parameters.json'
    parameters.write_text(json.dumps(params,ensure_ascii=False,indent=2),encoding='utf8')
    script=ROOT/'mac_simulation'/'mpfb_generate_avatar.py'
    cmd=[str(blender),'-b','-t',str(threads),'--python',str(script),'--',str(parameters),str(folder)]
    with (folder/'generation.log').open('w',encoding='utf8') as log:
        try:process=subprocess.run(cmd,cwd=str(ROOT),stdout=log,stderr=subprocess.STDOUT,timeout=600,check=False)
        except subprocess.TimeoutExpired:
            raise RuntimeError('MPFB : délai de génération dépassé. Consulter '+str(folder/'generation.log'))
    avatar=folder/'avatar.obj'
    if process.returncode!=0 or not valid_avatar(avatar):
        raise RuntimeError('Génération MPFB automatique échouée. Consulter '+str(folder/'generation.log'))
    # Reuse the real MPFB model on subsequent automated campaigns. Never
    # cache a placeholder OBJ or change the user's original avatar source.
    import hashlib
    cache=ROOT/'runs'/'avatars'
    cache.mkdir(parents=True,exist_ok=True)
    key=hashlib.sha256(json.dumps(params,sort_keys=True).encode()).hexdigest()[:16]
    cached=cache/('auto_mpfb_'+key+'.obj')
    shutil.copy2(avatar,cached)
    return cached


def find_avatar(explicit=None):
    if explicit:
        if not valid_avatar(explicit):raise RuntimeError('OBJ fourni incomplet : au moins 500 sommets et faces sont requis.')
        return Path(explicit)
    base=ROOT/'runs'/'avatars'
    candidates=sorted(base.glob('*.obj'),key=lambda p:p.stat().st_mtime,reverse=True) if base.exists() else []
    for p in candidates:
        if valid_avatar(p):return p
    raise RuntimeError('Aucun avatar MPFB réel disponible dans runs/avatars. Générer une fois l’avatar dans GBL ; aucun OBJ manuel n’est nécessaire.')


def inspect_report(r):
    """Hard, conservative acceptance gates. None are inferred from success:true."""
    blockers=[]
    if r.get('assembly_mode')!='preassembled':blockers.append('Coutures non soudées topologiquement.')
    shell=r.get('assembly_preflight') or {}
    if shell.get('connected_components')!=1 or shell.get('nonmanifold_edges',999)!=0:
        blockers.append('Maillage non connecté ou non-manifold.')
    if r.get('avatar',{}).get('landmarks',{}).get('upright_heuristic') is not True:
        blockers.append('Orientation du corps non confirmée.')
    if not r.get('avatar',{}).get('collision_enabled',False):
        blockers.append('Collisions du corps absentes.')
    avatar_fit=r.get('avatar_actual_fit') or {}
    if avatar_fit.get('allowed') is not True:
        blockers.append('Aisance non vérifiée sur les sections du véritable avatar MPFB.')
    fit=r.get('fit_preflight') or {}
    # This legacy proxy is NOT a true MPFB circumference measurement.
    if (fit.get('aisance_buste_cm') is not None and fit['aisance_buste_cm'] < 1):
        blockers.append('Aisance poitrine insuffisante selon proxy ; confirmer sur MPFB.')
    if (fit.get('aisance_haut_bras_cm') is not None and fit['aisance_haut_bras_cm'] < 1):
        blockers.append('Aisance du haut de bras insuffisante selon proxy.')
    badcontact=r.get('final_body_interpenetration') or {}
    penetration=badcontact.get('fraction_interpenetrating')
    if penetration is None: blockers.append('Pénétrations non mesurées (avatar absent ?).')
    elif penetration > .01: blockers.append(f'{penetration*100:.1f} % des sommets pénètrent le corps.')
    triangles=r.get('final_body_triangle_overlap') or {}
    if triangles.get('status')=='measured' and triangles.get('intersection_pairs',0)>0:
        blockers.append('Pénétration triangle/corps potentielle malgré sommets extérieurs.')
    initial_flat=r.get('pattern_2d_metric_initial') or {}
    if initial_flat.get('fraction_large_stretch',1)>.08:
        blockers.append('Pré-placement trop déformé par rapport au patron original.')
    from_flat=r.get('pattern_2d_metric_final') or {}
    flat_error=from_flat.get('fraction_large_stretch')
    if flat_error is None: blockers.append('Correspondance mécanique avec le patron 2D non mesurée.')
    elif flat_error > .08: blockers.append(f'{flat_error*100:.1f} % des arêtes ne respectent pas le patron JSON 2D.')
    clearance=r.get('dressed_body_clearance') or {}
    if (clearance.get('method')!='joint_2d_metric_collision_optimization'
            and clearance.get('maximum_correction_cm',0)>5):
        blockers.append('Projection ponctuelle sur le corps excessive (>5 cm).')
    # Joint optimisation can move a garment up to 17 cm *only* if material
    # lengths and collisions also pass their own independent strict gates.
    if (clearance.get('method')=='joint_2d_metric_collision_optimization'
            and clearance.get('maximum_correction_cm',0)>17):
        blockers.append('Pré-ajustement conjoint : déplacement excessif (>17 cm).')
    strain=r.get('deformation_diagnostic') or {}
    frac=strain.get('fraction_large_stretch')
    if frac is None: blockers.append('Déformation textile non mesurée.')
    elif frac > .08: blockers.append(f'{frac*100:.1f} % des arêtes trop déformées.')
    alignment=r.get('avatar_garment_alignment') or {}
    if alignment.get('status')!='ok': blockers.append('Positionnement épaules / corsage non validé.')
    stability=r.get('temporal_stability') or {}
    if stability.get('stable_by_displacement') is not True:
        blockers.append('Tissu encore mobile/oscillant en fin de simulation.')
    spatial=r.get('spatial_diagnostic') or {}
    extent=spatial.get('z_span_ratio')
    if extent is None:
        old=spatial.get('original_extent_m') or []
        new=spatial.get('final_extent_m') or []
        if len(old)==3 and len(new)==3 and old[2]>0:extent=new[2]/old[2]
    if extent is None: blockers.append('Étendue verticale du tissu non mesurée.')
    elif extent>1.7: blockers.append(f'Expansion verticale anormale ×{extent:.2f}.')
    if r.get('quality_status')!='candidate_for_visual_review':
        blockers.append('Évaluation interne du drapé négative.')
    # A strict gate is for automated candidate selection, not a proof of
    # real-world manufacturability or textile calibration.
    passed=not blockers
    score=0.0
    if penetration is None:score+=100
    else:score+=100*penetration
    if frac is None:score+=100
    else:score+=80*frac
    score+=25*(flat_error is None) + (0 if flat_error is None else flat_error*100)
    score+=30*(not stability.get('stable_by_displacement',False))
    score+=15*(alignment.get('status')!='ok')
    score+=20*(shell.get('nonmanifold_edges',999)!=0)
    score+=20*(r.get('quality_status')!='candidate_for_visual_review')
    score+=15*(extent is None or extent>1.7)
    score+=20*(avatar_fit.get('allowed') is not True)
    score+=5*len(blockers)
    return {'accepted_by_numeric_gates':passed,'score_lower_is_better':round(score,3),
            'blockers':blockers,'avatar_fit_estimate':avatar_fit,'fit_cm':{
                'corsage':fit.get('corsage_total_cm'),
                'buste_proxy':fit.get('buste_proxy_cm'),
                'aisance_proxy':fit.get('aisance_buste_cm'),
                'manche':fit.get('tour_haut_manche_cm'),
                'bras_proxy':fit.get('bras_proxy_cm')},
            'penetration_pct':round(100*penetration,2) if penetration is not None else None,
            'vertical_extent_ratio':round(extent,3) if extent is not None else None,
            'severe_strain_pct':round(100*frac,2) if frac is not None else None,
            'pattern_2d_error_pct':round(100*flat_error,2) if flat_error is not None else None,
            'temporal_stability':stability,
            'blender_quality_status':r.get('quality_status')}


def run_candidate(blender, avatar, pattern, out, cfg, threads=4, timeout=2700):
    directory=out/cfg['name'];directory.mkdir(parents=True,exist_ok=True)
    assert_config_is_effective(cfg)
    env=os.environ.copy()
    env.update({
        'GBL_AVATAR_OBJ':str(avatar),
        'GBL_AVATAR_ORIGIN':'mpfb_generated_in_gbl',
        'GBL_ARRANGEMENT_MODE':cfg['arrangement'],
        'GBL_AUTO_PREFIT':'1',
        'GBL_PREFIT_WEIGHTS':cfg['prefit_weights'],
        'GBL_PREFIT_EXPONENTS':cfg['prefit_exponents'],
        'GBL_PREFIT_CLEARANCES_MM':cfg['prefit_clearances_mm'],
        'GBL_SLEEVE_POSE':cfg['sleeve'],
        'GBL_MAX_SHIFT_M':str(cfg['max_shift']),
        'GBL_ASSEMBLY_MODE':'preassembled',
        'GBL_MESH_LEVELS':'2',
        'GBL_FRAME_END':str(cfg['frame']),
        'GBL_CLOTH_QUALITY':str(cfg['quality']),
        'GBL_CLOTH_COLLISION_QUALITY':str(cfg['collision_quality']),
        'GBL_CLOTH_MASS':str(cfg['mass']),
        'GBL_CLOTH_TENSION':str(cfg['tension']),
        'GBL_CLOTH_COMPRESSION':str(cfg['compression']),
        'GBL_CLOTH_SHEAR':str(cfg['shear']),
        'GBL_CLOTH_BENDING':str(cfg['bend']),
        'GBL_AIR_DAMPING':str(cfg['air']),
        'GBL_CLOTH_COLLISION_GAP':str(cfg['gap']),
        'GBL_SELF_COLLISION':str(cfg['self_collision']),
        'GBL_CLEARANCE_M':str(cfg['clearance']),
    })
    cmd=[str(blender),'-b','-t',str(threads),'--python',str(RUNNER),'--',str(pattern),str(directory)]
    began=time.monotonic()
    with (directory/'blender.log').open('w',encoding='utf8') as logfile:
        try:
            proc=subprocess.run(cmd,cwd=str(ROOT),env=env,stdout=logfile,stderr=subprocess.STDOUT,timeout=timeout,check=False)
            code=proc.returncode;failure=None
        except subprocess.TimeoutExpired:
            code=None;failure='Simulation interrompue : délai maximum dépassé.'
        except Exception as exc:
            code=None;failure='Exécution Blender impossible : '+str(exc)
    report_file=directory/'rapport_couture.json'
    record={'variant':cfg['name'],'configuration':cfg,'elapsed_seconds':round(time.monotonic()-began,1),
            'blender_exit_code':code,'error':failure,'output_folder':str(directory)}
    if code==0 and report_file.is_file():
        try:
            r=json.loads(report_file.read_text(encoding='utf8'))
            record.update(inspect_report(r))
        except (ValueError,TypeError) as e:record['error']='Rapport invalide: '+str(e)
    elif code not in (0,None):
        record['error']='Blender est sorti avec le code '+str(code)
        try:
            logs=(directory/'blender.log').read_text(encoding='utf8',errors='replace').splitlines()
            errors=[line.strip() for line in logs[-45:] if line.strip().startswith(('AttributeError:', 'ValueError:', 'RuntimeError:', 'TypeError:', 'GBL_MPFB_ERROR:'))]
            if errors:record['error']+=' : '+errors[-1][:500]
        except OSError:pass
    if 'accepted_by_numeric_gates' not in record:
        record.update({'accepted_by_numeric_gates':False,'score_lower_is_better':9999,
                       'blockers':[record.get('error') or 'Aucun rapport Blender vérifiable.']})
    (directory/'evaluation.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf8')
    return record


def report_html(entries, out, avatar, pattern):
    def row(e):
        directory=Path(e['output_folder'])
        thumb=directory/'tshirt_preview.png'
        img=f'<img src="{html.escape(directory.name)}/tshirt_preview.png" width="180">' if thumb.exists() else '<span>Rendu absent</span>'
        return (f'<tr><td>{html.escape(e["variant"])}</td><td>{"ACCEPTÉ" if e["accepted_by_numeric_gates"] else "REJETÉ"}</td>'
                f'<td>{e["score_lower_is_better"]}</td><td>{e.get("penetration_pct","—")}</td>'
                f'<td>{e.get("severe_strain_pct","—")}</td><td>{img}</td>'
                f'<td>{html.escape(" | ".join(e["blockers"]))}</td></tr>')
    passed=sum(e['accepted_by_numeric_gates'] for e in entries)
    body='\n'.join(map(row,entries))
    doc=f'''<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>GBL — validation automatique</title>
<style>body{{font:15px -apple-system,Arial,sans-serif;margin:38px;background:#fafafa;color:#222}}
 table{{border-collapse:collapse;width:100%}}th,td{{border:1px solid #ccc;text-align:left;padding:9px;vertical-align:top}}tr:nth-child(even){{background:#eee}}img{{border-radius:8px}}h1{{margin-bottom:8px}}</style></head>
<body><h1>Garment Bending Lab — validation physique automatique</h1>
<p><b>{passed} configuration(s) retenue(s) sur {len(entries)}</b> selon les seuils numériques internes.</p>
<p>Avatar : {html.escape(avatar.name)} · Patron : {html.escape(pattern.name)}</p>
<p><strong>Aucun score ne certifie un vêtement cousable, une physique calibrée ou une équivalence CLO3D.</strong> Les modèles qui échouent sont conservés pour diagnostic ; ils ne sont pas présentés comme validés.</p>
<table><tr><th>Réglage</th><th>Statut</th><th>Score ↓</th><th>Pénétration %</th><th>Déformation forte %</th><th>Image</th><th>Motifs</th></tr>{body}</table></body></html>'''
    (out/'rapport_comparatif.html').write_text(doc,encoding='utf8')



def preflight_mpfb_sections(avatar, pattern_document):
    """Run one shared MPFB fit preflight before starting six Blender jobs.

    If measurements are unavailable or the pattern is clearly too small,
    repeating the same Blender preflight six times wastes time and creates
    six near-identical errors. This routine does *not* modify the pattern.
    """
    from diagnostic_mensurations import read_obj
    from garmentlab.avatar_registration import body_landmarks
    from garmentlab.anthropometry import estimate_avatar_girths, compare_pattern_bodice_to_avatar
    from garmentlab.fitting import fit_reference
    vertices,faces=read_obj(Path(avatar))
    landmarks=body_landmarks(vertices)
    measurements=estimate_avatar_girths(vertices,landmarks['shoulder_estimate_z_m'],faces)
    fit=fit_reference(pattern_document)
    if not fit.get('applicable'):
        return {'allowed':False,'status':'unverified','reason':'Le patron ne se prête pas au contrôle poitrine.'}
    result=compare_pattern_bodice_to_avatar(fit['corsage_total_cm'],measurements,min_ease_cm=0.0)
    return {**result,'measurements':measurements,'avatar_landmarks':landmarks}


def write_preflight_failure(out, result, avatar, pattern):
    payload={'avatar':str(avatar),'pattern':str(pattern),
             'validated_candidates':0,'candidates':[],
             'status':'BLOCKED_BEFORE_BLENDER','avatar_actual_fit':result}
    (out/'resultats.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf8')
    (out/'diagnostic_mensurations.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
    reason=html.escape(result.get('reason','Mesures du torse non validées.'))
    (out/'rapport_comparatif.html').write_text(
        '<html lang="fr"><meta charset="utf-8"><title>GBL — précontrôle avatar</title>'
        '<body style="font-family:sans-serif;max-width:850px;margin:3em auto">'
        '<h1>Aucun drapé validé — calcul Blender non lancé</h1>'
        '<p>Le même échec se serait répété sur les six variantes. '+reason+'</p>'
        '<p>Consulter <code>diagnostic_mensurations.json</code> pour les contours à chaque hauteur.</p>'
        '<p>GBL ne change pas le patron JSON ni les mensurations MPFB.</p></body></html>',
        encoding='utf8')
    (out/'meilleur_resultat.txt').write_text(
        'AUCUN DRAPÉ VALIDÉ — précontrôle morphologique non satisfait.\n'+str(result)+'\n',
        encoding='utf8')

def main(argv=None):
    parser=argparse.ArgumentParser(description='Teste automatiquement plusieurs drapés sur le même mannequin MPFB.')
    parser.add_argument('--avatar',type=Path,help='Facultatif : OBJ MPFB déjà généré par GBL')
    parser.add_argument('--pattern',type=Path,default=PATTERN)
    parser.add_argument('--blender',type=Path)
    parser.add_argument('--threads',type=int,default=4)
    parser.add_argument('--timeout',type=int,default=2700,help='Temps limite par simulation en secondes')
    parser.add_argument('--quick',action='store_true',help='Seulement 2 expériences pour un prédiagnostic')
    parser.add_argument('--height-cm',type=float,default=174.0,help='Taille de l’avatar généré automatiquement (défaut : 174 cm)')
    args=parser.parse_args(argv)
    blender=find_blender(args.blender)
    if not args.pattern.is_file():raise RuntimeError('Patron JSON introuvable : '+str(args.pattern))
    # A JSON must actually contain panels and explicit stitch definitions.
    document=json.loads(args.pattern.read_text(encoding='utf8'))
    from garmentlab.sewn_geometry import build_sewn_layout
    layout=build_sewn_layout(document)
    if len(layout['panel_loops'])!=4:raise RuntimeError('Banc de référence actuellement limité aux quatre panneaux du T-shirt.')
    from garmentlab.fitting import fit_reference, validate_baseline_fit_for_simulation
    fit=validate_baseline_fit_for_simulation(fit_reference(document))
    if not fit['allowed']:
        raise RuntimeError('Patron de référence incompatible avant calcul : '+' '.join(fit['reasons']))
    out=ROOT/'runs'/'validation_auto'/dt.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    out.mkdir(parents=True,exist_ok=True)
    if args.avatar:
        avatar=find_avatar(args.avatar)
    else:
        try:
            avatar=find_avatar()
        except RuntimeError:
            print('Aucun MPFB mis en cache : génération automatique dans Blender...',flush=True)
            avatar=generate_avatar_mpfb(blender,out,height_cm=args.height_cm,threads=args.threads)
    # Evaluate actual MPFB polygon cross sections exactly once.  The previous
    # version launched six Blender processes that all failed with the same
    # spurious 143 cm chest estimate from vertex bands.
    actual_fit=preflight_mpfb_sections(avatar,document)
    print('GBL_AUTO_MPFB_TORSO_PREFLIGHT',json.dumps(actual_fit,ensure_ascii=False),flush=True)
    if not actual_fit['allowed']:
        write_preflight_failure(out,actual_fit,avatar,args.pattern)
        print('AUCUN DRAPÉ LANCÉ : mensurations MPFB incertaines ou patron réellement trop petit. '
              'Diagnostic :',out/'diagnostic_mensurations.json',flush=True)
        return 2
    entries=[]
    configs=CONFIGS[:2] if args.quick else CONFIGS
    print(f'GBL AUTO: {len(configs)} variantes, avatar {avatar.name}, patron {args.pattern.name}',flush=True)
    for i,cfg in enumerate(configs,1):
        print(f'[{i}/{len(configs)}] {cfg["name"]} : calcul Blender...',flush=True)
        result=run_candidate(blender,avatar,args.pattern,out,cfg,threads=args.threads,timeout=args.timeout)
        entries.append(result)
        report_html(entries,out,avatar,args.pattern)
        (out/'resultats.json').write_text(json.dumps({'avatar':str(avatar),'pattern':str(args.pattern),'candidates':entries,
            'validated_candidates':sum(e['accepted_by_numeric_gates'] for e in entries)},ensure_ascii=False,indent=2),encoding='utf8')
        print('  ', 'ACCEPTÉ' if result['accepted_by_numeric_gates'] else 'REJETÉ',result['blockers'],flush=True)
    chosen=sorted(entries,key=lambda e:(not e['accepted_by_numeric_gates'],e['score_lower_is_better']))[0]
    if chosen['accepted_by_numeric_gates']:
        chosen_dir=Path(chosen['output_folder'])
        selected=out/'selection_validee_numeriquement'
        selected.mkdir(exist_ok=True)
        for filename in ('atelier_tshirt_cousu.blend','tshirt_preview.png','tshirt_preassemblage.obj',
                         'tshirt_cousu.obj','rapport_couture.json','evaluation.json'):
            source=chosen_dir/filename
            if source.is_file():shutil.copy2(source,selected/filename)
    (out/'meilleur_resultat.txt').write_text(
        'Meilleur résultat NUMÉRIQUE, pas un certificat de drapé réaliste.\n'+
        'Configuration : '+chosen['variant']+'\n'+
        'VALIDATION : '+('PASSÉE' if chosen['accepted_by_numeric_gates'] else 'AUCUNE CONFIGURATION VALIDÉE')+'\n'+
        'Dossier : '+chosen['output_folder']+'\n'+
        'Problèmes : '+ ' | '.join(chosen['blockers'])+'\n',encoding='utf8')
    print('Rapport comparatif :',out/'rapport_comparatif.html',flush=True)
    print('Résultat :', 'VALIDÉ NUMÉRIQUEMENT, contrôle visuel restant nécessaire' if chosen['accepted_by_numeric_gates'] else 'AUCUN DRAPÉ VALIDÉ',flush=True)
    return 0 if chosen['accepted_by_numeric_gates'] else 2

if __name__=='__main__':
    try:sys.exit(main())
    except Exception as exc:
        print('GBL AUTO - impossible de lancer les expériences:',exc,file=sys.stderr)
        sys.exit(3)
