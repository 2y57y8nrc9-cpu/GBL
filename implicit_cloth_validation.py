#!/usr/bin/env python3
"""Experimental implicit cloth-like mass/spring trajectory on SYNTHETIC avatar.
No Blender/MPFB; not calibrated cloth, no production self-contact.
"""
import json, time, sys
from pathlib import Path
import numpy as np
from scipy.optimize import minimize
import trimesh
from offline_elastic_relaxation import run as elastic_run, build_state
from synthetic_contact_experiment import penetrations,torso_radii

ROOT=Path(__file__).resolve().parent;OUT=ROOT/'validation_dynamique';OUT.mkdir(exist_ok=True)

def body_field(p,clearance=.012):
    # Signed-distance + radial normals, approximations for torso & arm sections.
    x,y,z=p.T
    rx,ry=torso_radii(z)
    a=rx+clearance;b=ry+clearance
    R=np.maximum(np.sqrt((x/a)**2+(y/b)**2),1e-7)
    # physical gradient from implicit ellipse, normalized so distance units meters
    gx=x/(a*a*R);gy=y/(b*b*R)
    gnorm=np.maximum(np.sqrt(gx*gx+gy*gy),1e-8)
    rad=np.column_stack((gx/gnorm,gy/gnorm,np.zeros(len(p))))
    signed=(R-1.)/gnorm
    active=(z>.75)&(z<1.48)
    violation=np.where(active,np.minimum(signed,0),0)
    gradients=violation[:,None]*rad
    cost=np.sum(violation**2)
    # arm capsules
    for side in (-1,1):
        s=np.array([side*.205,0,1.39]);e=np.array([side*.755,0,.89]);axis=e-s
        tt=np.clip(((p-s)@axis)/(axis@axis),0,1)
        centre=s+tt[:,None]*axis
        diff=p-centre
        d=np.maximum(np.linalg.norm(diff,axis=1),1e-7)
        radii=(.062-.023*tt)+clearance
        v=np.minimum(d-radii,0)
        inarm=(np.abs(x)>.20)&(v<0)
        v=np.where(inarm,v,0)
        gradients+=v[:,None]*(diff/d[:,None])
        cost+=np.sum(v**2)
    return cost, gradients


def step_implicit(pos,old,prev,edges,pins,pinxyz,dt=.03,gravity=9.81,
                  inertial=.9,spring=10000,collision=30000,anchor=300000,
                  bend=0, pose_ref=None, pose=0., iterations=35):
    ids=edges[:,:2].astype(np.int64);rest=edges[:,2]
    oldv=(old-prev)*.78
    predicted=old+oldv+np.array([0.,0.,-gravity*dt*dt])
    def fun(xx):
        p=xx.reshape(-1,3)
        grad=np.zeros_like(p)
        delta=p[ids[:,0]]-p[ids[:,1]]
        L=np.maximum(np.linalg.norm(delta,axis=1),1e-9)
        strain=L-rest
        E=.5*spring*np.sum(strain**2)
        force=spring*(strain/L)[:,None]*delta
        np.add.at(grad,ids[:,0],force)
        np.add.at(grad,ids[:,1],-force)
        d=p-predicted
        E+=.5*inertial*np.sum(d**2)/(dt*dt)
        grad+=inertial*d/(dt*dt)
        c,cgrad=body_field(p)
        E+=.5*collision*c
        grad+=collision*cgrad
        ps=p[pins]-pinxyz
        E+=.5*anchor*np.sum(ps**2)
        np.add.at(grad,pins,anchor*ps)
        if pose and pose_ref is not None:
            diff=p-pose_ref
            E+=.5*pose*np.sum(diff**2);grad+=pose*diff
        return float(E),grad.ravel()
    r=minimize(fun,predicted.ravel(),method='L-BFGS-B',jac=True,options={'maxiter':iterations,'gtol':1e-3,'ftol':1e-8,'maxls':24})
    p=r.x.reshape((-1,3));p[pins]=pinxyz
    return p, r


def simulate(mode='guided',spring=10000,collision=30000,dt=.03,inertial=.9,steps=90,iterations=40):
    r0,x0,faces,stat=elastic_run(mode,weight=4000,iters=200)
    _,_,edges,pins=build_state(mode)
    pins=np.array(pins,dtype=int)
    # Experimental virtual shoulder supports for reference A-pose, not seams.
    extra=[]
    for sx in (-1,1):
        for sy in (-1,1):
            target=np.array([sx*.22, sy*.11, 1.41])
            idx=int(np.argmin(np.sum((x0-target)**2,axis=1)))
            extra.append(idx)
    pins=np.unique(np.r_[pins,extra])
    anchor=x0[pins].copy()
    p=x0.copy();prev=x0.copy()
    samples=[]; t0=time.monotonic()
    for f in range(steps+1):
        if f:
            nxt,optim=step_implicit(p,p,prev,edges,pins,anchor,dt=dt,spring=spring,collision=collision,inertial=inertial,iterations=iterations)
            prev=p;p=nxt
        if f%10==0 or f==steps:
            t,a=penetrations(p)
            ii=edges[:,:2].astype(int);rat=np.linalg.norm(p[ii[:,0]]-p[ii[:,1]],axis=1)/edges[:,2]
            bad=float(np.mean((rat<.65)|(rat>1.5)))
            d=np.linalg.norm(p-prev,axis=1)
            m={'frame':f,'penetration_pct':round(100*np.mean(t|a),3),'severe_2d_error_pct':round(100*bad,3),
               'median_step_motion_mm':round(1000*float(np.median(d)),3),
               'p95_motion_mm':round(1000*float(np.quantile(d,.95)),3),
               'median_edge_ratio':round(float(np.median(rat)),4)}
            print(m,flush=True);samples.append(m)
    elapsed=time.monotonic()-t0
    name=f'implicit_s{spring:.0f}_c{collision:.0f}_i{inertial:.2f}'
    trimesh.Trimesh(vertices=p,faces=faces,process=False).export(OUT/(name+'.obj'))
    return {'label':'SYNTHETIC BODY, IMPLICIT RESEARCH SPRING-MASS, NOT BLENDER OR REAL MPFB',
            'name':name,'elapsed':round(elapsed,2),'param':dict(spring=spring,collision=collision,dt=dt,inertial=inertial,steps=steps),
            'frames':samples,'baseline':stat,'blender_verified':False}

if __name__=='__main__':
    rows=[]
    for settings in [(10000,30000,.9),(25000,40000,.6),(25000,100000,1.)]:
        try:
            r=simulate(spring=settings[0],collision=settings[1],inertial=settings[2],steps=70,iterations=28)
            rows.append(r)
        except Exception as e:
            rows.append({'parameters':settings,'error':str(e)})
        (OUT/'implicit_results.json').write_text(json.dumps(rows,indent=2,ensure_ascii=False,default=float))
    print('COMPARE',[(r.get('frames',[-1])[-1] if r.get('frames') else r) for r in rows],flush=True)
