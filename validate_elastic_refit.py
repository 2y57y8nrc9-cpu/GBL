"""Independently compare pure-NumPy L-BFGS refit with SciPy experiment.
Requires optional SciPy, Shapely and trimesh. Synthetic body only.
"""
from pathlib import Path
import json
import numpy as np
from offline_elastic_relaxation import build_state
from synthetic_contact_experiment import torso_radii,penetrations
from garmentlab.elastic_refit import material_preserving_refit
from garmentlab.drape_quality import pattern_stretch_diagnostic
import trimesh
ROOT=Path(__file__).resolve().parent
OUT=ROOT/'validation_geometrie'


def synthetic_signed_normal(p):
    p=np.asarray(p,dtype=float)
    x,y,z=p[:,0],p[:,1],p[:,2]
    rx,ry=torso_radii(z)
    R=np.maximum(np.sqrt((x/rx)**2+(y/ry)**2),1e-8)
    scale=np.minimum(rx,ry)
    signed=(R-1)*scale
    gradient=np.stack((x/(rx*rx)/R, y/(ry*ry)/R,np.zeros_like(x)),axis=-1)
    norm=np.maximum(np.linalg.norm(gradient,axis=1),1e-8)
    gradient/=norm[:,None]
    signed[(z<.75)|(z>1.48)]=1.
    for side in (-1,1):
        start=np.array([side*.205,0,1.39]);end=np.array([side*.755,0,.89]);axis=end-start
        t=np.clip(((p-start)@axis)/(axis@axis),0,1)
        centre=start+np.outer(t,axis)
        delta=p-centre
        dist=np.maximum(np.linalg.norm(delta,axis=1),1e-8)
        radius=.062-.023*t
        arm_signed=dist-radius
        arm_signed[np.abs(x)<.20]=1.
        better=arm_signed<signed
        signed[better]=arm_signed[better]
        gradient[better]=delta[better]/dist[better,None]
    return signed,gradient


def run():
    values=[]
    for mode in ('legacy','guided'):
        x,f,edges,pins=build_state(mode)
        edge_list=[(int(a),int(b),float(r)) for a,b,r in edges]
        for k in (2000,4000,12000):
            result=material_preserving_refit(x,edge_list,pins,synthetic_signed_normal,
                                           iterations=150,collision_weight=k)
            xyz=np.asarray(result['vertices']);torso,arms=penetrations(xyz)
            strain=pattern_stretch_diagnostic(xyz,edge_list)
            row={'mode':mode,'collision_weight':k,'iterations':result['stats']['iterations'],
                 'estimated_penetration_pct':round(100*np.mean(torso|arms),3),
                 '2d_severe_strain_pct':round(100*strain['fraction_large_stretch'],3),
                 'max_shift_cm':result['stats']['maximum_shift_cm'],
                 'method':result['stats']['method']}
            values.append(row)
            trimesh.Trimesh(vertices=xyz,faces=f,process=False).export(OUT/f'lbfgs_{mode}_{k}.obj')
            print(row,flush=True)
    (OUT/'test_lbfgs_synthetique.json').write_text(json.dumps({'warning':'Only synthetic body, not Blender or MPFB.','results':values},indent=2))

if __name__=='__main__':run()
