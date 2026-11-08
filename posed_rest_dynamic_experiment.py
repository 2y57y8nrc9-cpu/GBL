"""SYNTHETIC-body implicit research for Blender-like 3D rest shape.

Uses *posed* 3D sewn shell as spring rest geometry (Blender Cloth preassembled
workaround), while independently checking the original 2D pattern metric.
No actual Blender or MPFB dynamics or fitted jersey material model.
"""
import json
from pathlib import Path
import numpy as np
import trimesh
from scipy.optimize import minimize
from offline_elastic_relaxation import build_state
from test_auto_fit_synthetic import callback
from garmentlab.auto_fit import search_pre_fit
from synthetic_contact_experiment import penetrations
from implicit_cloth_validation import body_field

OUT=Path(__file__).resolve().parent/'validation_dynamique';OUT.mkdir(exist_ok=True)

def simulate(spring=8000,contact=16000,mass=.00025,dt=.025,frames=130,anchor_extra=True):
    base,faces,metric,pins=build_state('guided')
    fit=search_pre_fit(base,metric,pins,callback,relative_stiffness_exponents=(1.,2.),weights=(4000.,12000),clearances=(.01,),iterations=140)
    x=np.asarray(fit['vertices']);origin=x.copy();prev=x.copy()
    edges=metric[:,:2].astype(int)
    rest3d=np.linalg.norm(x[edges[:,0]]-x[edges[:,1]],axis=1)
    material_rest=metric[:,2]
    pins=np.asarray(pins,dtype=int)
    if anchor_extra:
        for sx in (-1,1):
            for sy in (-1,1):
                target=np.array([sx*.22,sy*.11,1.41]);pins=np.r_[pins,int(np.argmin(np.sum((x-target)**2,axis=1)))]
    pins=np.unique(pins);support=x[pins].copy()
    records=[]
    for f in range(frames+1):
        if f:
            predicted=x+(x-prev)*.65+np.array([0,0,-9.81*dt*dt])
            def energy(xx):
                p=xx.reshape((-1,3));grad=np.zeros_like(p)
                d=p[edges[:,0]]-p[edges[:,1]];ll=np.maximum(np.linalg.norm(d,axis=1),1e-9)
                strain=ll-rest3d
                E=.5*spring*np.sum(strain**2)
                forces=(spring*strain/ll)[:,None]*d
                np.add.at(grad,edges[:,0],forces);np.add.at(grad,edges[:,1],-forces)
                offset=p-predicted
                E+=.5*(mass/dt**2)*np.sum(offset**2);grad+=(mass/dt**2)*offset
                c,cg=body_field(p)
                E+=.5*contact*c;grad+=contact*cg
                dif=p[pins]-support
                E+=.5*1e6*np.sum(dif**2)
                np.add.at(grad,pins,1e6*dif)
                return float(E),grad.ravel()
            opt=minimize(energy,predicted.ravel(),jac=True,method='L-BFGS-B',options={'maxiter':40,'ftol':1e-7,'gtol':1e-4})
            prev=x;x=opt.x.reshape(-1,3);x[pins]=support
        if f%10==0 or f==frames:
            t,a=penetrations(x)
            relative=np.linalg.norm(x[edges[:,0]]-x[edges[:,1]],axis=1)/material_rest
            err=np.mean((relative<.65)|(relative>1.5))
            disp=np.linalg.norm(x-prev,axis=1)
            row={'frame':f,'penetrating_pct':round(100*np.mean(t|a),3),
                 'material_error_pct':round(100*err,3),
                 'median_displacement_mm':round(1000*float(np.median(disp)),3),
                 'p95_displacement_mm':round(1000*float(np.quantile(disp,.95)),3)}
            records.append(row);print(row,flush=True)
    file=OUT/f'posed_rest_s{spring}_c{contact}.obj'
    trimesh.Trimesh(vertices=x,faces=faces,process=False).export(file)
    return {'status':'SYNTHETIC_CPU_IMPLICIT_NOT_BLENDER','spring':spring,'contact':contact,
            'initial':fit['best'],'frames':records,'avatar':'SYNTHETIC',
            'simulated_on_real_MPFB':False}

if __name__=='__main__':
    results=[]
    for k,cont in ((6000,12000),(18000,30000),(60000,70000)):
        result=simulate(spring=k,contact=cont)
        results.append(result)
        (OUT/'posed_rest_results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
    print('FINAL',[(r['spring'],r['frames'][-1]) for r in results])
