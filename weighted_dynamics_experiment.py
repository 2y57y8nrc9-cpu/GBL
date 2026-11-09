"""A-pose synthetic body only; weighted 2D chart constraints in implicit research dynamics."""
import json
from pathlib import Path
import numpy as np
from scipy.optimize import minimize
import trimesh
from offline_elastic_relaxation import build_state
from test_auto_fit_synthetic import callback
from garmentlab.auto_fit import search_pre_fit
from synthetic_contact_experiment import penetrations
from implicit_cloth_validation import body_field

ROOT=Path(__file__).resolve().parent
OUT=ROOT/'validation_dynamique';OUT.mkdir(exist_ok=True)

def sim(spring=12000, collision=18000, mass=.0003, pose=15, steps=85, dt=.03):
    base, faces, metric, pins=build_state('guided')
    prefit=search_pre_fit(base,metric,pins,callback,iterations=120,
                          clearances=(.01,),weights=(4000,12000),relative_stiffness_exponents=(1.,2.))
    start=np.array(prefit['vertices'])
    ii=metric[:,:2].astype(int);rr=metric[:,2]
    weights=np.clip((np.median(rr)/rr)**2,.15,15.)
    pinned=np.array(pins,int)
    # Four extra shoulder anchors on pose A (temporary support only)
    for xx in (-.22,.22):
        for yy in (-.105,.105):
            target=np.array([xx,yy,1.405])
            pinned=np.r_[pinned,int(np.argmin(np.sum((start-target)**2,axis=1)))]
    pinned=np.unique(pinned)
    anchor=start[pinned].copy()
    current=start.copy();older=start.copy()
    frames=[]
    for k in range(steps+1):
        if k:
            predicted=current+.74*(current-older)+np.array([0,0,-9.81*dt*dt])
            def fun(q):
                p=q.reshape(-1,3)
                d=p[ii[:,0]]-p[ii[:,1]];ll=np.maximum(np.linalg.norm(d,axis=1),1e-9)
                stretch=ll-rr
                E=.5*spring*np.sum(weights*stretch**2)
                force=spring*(weights*stretch/ll)[:,None]*d
                g=np.zeros_like(p)
                np.add.at(g,ii[:,0],force);np.add.at(g,ii[:,1],-force)
                dc=p-predicted
                E+=.5*(mass/dt**2)*np.sum(dc**2)
                g+=(mass/dt**2)*dc
                c,cgrad=body_field(p)
                E+=.5*collision*c;g+=collision*cgrad
                pa=p[pinned]-anchor
                E+=.5*1e6*np.sum(pa**2)
                np.add.at(g,pinned,1e6*pa)
                ps=p-start
                E+=.5*pose*np.sum(ps**2);g+=pose*ps
                return float(E),g.ravel()
            r=minimize(fun,predicted.ravel(),jac=True,method='L-BFGS-B',options={'maxiter':38,'ftol':1e-8,'gtol':1e-4})
            older=current;current=r.x.reshape(-1,3)
            current[pinned]=anchor
        if k%10==0 or k==steps:
            tt,aa=penetrations(current)
            ratios=np.linalg.norm(current[ii[:,0]]-current[ii[:,1]],axis=1)/rr
            b=np.mean((ratios<.65)|(ratios>1.5))
            motion=np.median(np.linalg.norm(current-older,axis=1)) if k else 0
            row=dict(step=k,penetrations_pct=round(100*np.mean(tt|aa),3),
                     severe_2d_pct=round(100*b,3),median_displacement_mm=round(1000*motion,3),
                     p99_ratio=round(float(np.quantile(ratios,.99)),3))
            frames.append(row);print(row,flush=True)
    name=f'weighted_s{spring}_c{collision}_pose{pose}'
    trimesh.Trimesh(vertices=current,faces=faces,process=False).export(OUT/(name+'.obj'))
    return {'name':name,'status':'SYNTHETIC_ONLY_NOT_BLENDER','initial':prefit['best'],
            'frames':frames,'pose_restraint':pose}

if __name__=='__main__':
    rows=[]
    for p in (0,20,150):
        r=sim(spring=12000,collision=18000,pose=p,steps=70)
        rows.append(r)
        (OUT/'weighted_dynamics_results.json').write_text(json.dumps(rows,indent=2,ensure_ascii=False))
    print('FINAL',[(x['name'],x['frames'][-1]) for x in rows])
