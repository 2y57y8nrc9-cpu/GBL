#!/usr/bin/env python3
"""CPU spring-mass/PBD prototype on a SYNTHETIC body, not MPFB / Blender / CLO.

Explicit data provenance: stitched topology and 2D rest lengths from JSON;
analytic torso + A-pose arm obstacles. Does not claim production-quality cloth.
"""
from pathlib import Path
import json, time, math, sys
import numpy as np
import trimesh
from offline_elastic_relaxation import run as elastic_run, build_state
from garmentlab.drape_quality import pattern_stretch_diagnostic
from synthetic_contact_experiment import penetrations, torso_radii

OUT=Path(__file__).resolve().parent/'validation_dynamique'
OUT.mkdir(exist_ok=True)


def project_body(x, clearance=.009):
    p=x.copy()
    z=p[:,2];rx,ry=torso_radii(z)
    mask=(z>.75)&(z<1.48)
    r=np.sqrt((p[:,0]/(rx+clearance))**2+(p[:,1]/(ry+clearance))**2)
    inward=mask&(r<1.)
    factor=np.ones(len(p))
    factor[inward]=1.001/np.maximum(r[inward],.0001)
    p[inward,0]*=factor[inward];p[inward,1]*=factor[inward]
    for side in (-1,1):
        start=np.array([side*.205,0,1.39]);end=np.array([side*.755,0,.89]);axis=end-start
        t=np.clip(((p-start)@axis)/(axis@axis),0,1)
        center=start+t[:,None]*axis
        delta=p-center
        d=np.maximum(np.linalg.norm(delta,axis=1),1e-7)
        radius=.062-.023*t+clearance
        inside=(np.abs(p[:,0])>.20)&(d<radius)
        if inside.any():
            offset=delta[inside]*(radius[inside]/d[inside])[:,None]
            p[inside]=center[inside]+offset
    return p


def simulate(mode='guided',contact_weight=4000, damping=.86, constraint_strength=.67,dt=1./90., frames=140, iterations=14):
    res,x0,tri,stat=elastic_run(mode,weight=contact_weight,iters=200)
    _,_,edges,pinned=build_state(mode)
    edge_indices=edges[:,:2].astype(int);rest=edges[:,2]
    anchors=np.array(pinned,dtype=int)
    pinpos=x0[anchors].copy()
    x=x0.copy();prev=x.copy()
    events=[]
    start=time.monotonic()
    # Preserve 2D panel metrics; sew points are topology-identical at all times.
    for frame in range(frames+1):
        if frame:
            velocity=(x-prev)*damping
            prev=x.copy()
            x=x+velocity+np.array([0,0,-9.81])*(dt*dt)
            for k in range(iterations):
                d=x[edge_indices[:,0]]-x[edge_indices[:,1]]
                L=np.maximum(np.linalg.norm(d,axis=1),1e-8)
                excess=(L-rest)/L
                # non-rigid distributed correction on all original material edges
                c=.5*constraint_strength*(excess[:,None]*d)
                acc=np.zeros_like(x);den=np.zeros(len(x))
                np.add.at(acc,edge_indices[:,0],-c)
                np.add.at(acc,edge_indices[:,1],c)
                np.add.at(den,edge_indices[:,0],1)
                np.add.at(den,edge_indices[:,1],1)
                x+=acc/np.maximum(den[:,None],1)
                x=project_body(x)
                x[anchors]=pinpos
        if frame%10==0 or frame==frames:
            t,a=penetrations(x)
            ratio=np.linalg.norm(x[edge_indices[:,0]]-x[edge_indices[:,1]],axis=1)/rest
            bad=float(np.mean((ratio<.65)|(ratio>1.5)))
            move=float(np.median(np.linalg.norm(x-prev,axis=1))) if frame else 0
            data={'frame':frame,'penetration_pct':round(100*float(np.mean(t|a)),3),
                  'severe_material_error_pct':round(100*bad,3),
                  'median_frame_displacement_mm':round(1000*move,3),
                  'median_material_ratio':round(float(np.median(ratio)),4)}
            events.append(data)
            print(data,flush=True)
    total=time.monotonic()-start
    mesh=trimesh.Trimesh(vertices=x,faces=tri,process=False)
    mesh.export(OUT/f'tshirt_cpu_proxy_{mode}.obj')
    trimesh.Trimesh(vertices=x0,faces=tri,process=False).export(OUT/f'tshirt_initial_{mode}.obj')
    return {'label':'SYNTHETIC AVATAR / CPU PBD PROTOTYPE - NOT MPFB OR BLENDER',
           'mode':mode,'damping':damping,'strength':constraint_strength,'dt':dt,
           'frames':frames,'iterations':iterations,'seconds':round(total,2),
           'metric_start':stat,'frames_sampled':events,
           'final_contact_pct':events[-1]['penetration_pct'],
           'final_strain_pct':events[-1]['severe_material_error_pct'],
           'final_motion_mm_per_frame':events[-1]['median_frame_displacement_mm'],
           'accepted_as_blender_drape':False}


def main():
    rows=[]
    for strength,damping in [(.67,.86),(.9,.78),(.5,.88)]:
        r=simulate(constraint_strength=strength,damping=damping)
        rows.append(r)
        (OUT/'simulations_cpu.json').write_text(json.dumps(rows,indent=2,ensure_ascii=False,default=float))
    print('ALL',[(r['final_contact_pct'],r['final_strain_pct'],r['final_motion_mm_per_frame']) for r in rows])
if __name__=='__main__':main()
