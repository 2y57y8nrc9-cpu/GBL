"""SciPy research experiment only; DOES NOT run Blender Cloth or MPFB.

Static constrained energy search around a synthetic A-pose avatar. Never mark
these output poses as physically simulated, stable under dynamics or sewable.
"""
import json
from pathlib import Path
import numpy as np
from scipy.optimize import minimize
from benchmark_geometrique import triangulate_layout,mapping,procedural_avatar_points
from garmentlab.sewn_geometry import build_sewn_layout
from garmentlab.sewn_mesh import build_stable_sewn_mesh
from garmentlab.preassembled import assemble_sewn_shell
from garmentlab.drape_quality import build_pattern_metric_edges,pattern_stretch_diagnostic
from garmentlab.anatomical_arrangement import AnatomicalArrangement
from synthetic_contact_experiment import penetrations,torso_radii
import trimesh
ROOT=Path(__file__).resolve().parent
OUT=ROOT/'validation_geometrie'


def build_state(mode):
 doc=json.loads((ROOT/'patrons_json'/'01_tshirt_regular_specification.json').read_text())
 layout=build_sewn_layout(doc)
 tris=triangulate_layout(layout)
 guide=AnatomicalArrangement(procedural_avatar_points(),1.44) if mode=='guided' else None
 points=[mapping(layout,guide)(i,i,uv) for i,uv in enumerate(layout['flat_vertices'])]
 prepared=build_stable_sewn_mesh(points,tris,layout['sewing_pairs'],layout['sewing_paths'],layout['pinned'],levels=2,
    chart_uv=layout['flat_vertices'],surface_map=mapping(layout,guide),vertex_panels=layout['vertex_panel'])
 joined=assemble_sewn_shell(prepared['vertices'],prepared['triangles'],prepared['stitch_edges'],prepared['pinned'])
 edges=np.asarray(build_pattern_metric_edges(prepared['triangles'],prepared['flat_vertices'],joined['old_to_new']))
 return np.array(joined['vertices'],dtype=float),np.array(joined['triangles'],dtype=int),edges,joined['pinned']


def energy_gradient(xx,base,edge,anchors,edge_weight=2000.,collision_weight=10000.,anchor_weight=10000.,pose_weight=2.,clearance=.012):
 p=xx.reshape((-1,3));n=len(p)
 grad=np.zeros_like(p)
 en=0.
 # True 2D chart edge lengths, not posed 3D lengths.
 ids=edge[:,:2].astype(int);rest=edge[:,2]
 d=p[ids[:,0]]-p[ids[:,1]]
 lens=np.maximum(np.linalg.norm(d,axis=1),1e-8)
 stretch=lens-rest
 en+=.5*edge_weight*np.sum(stretch**2)
 f=edge_weight*(stretch/lens)[:,None]*d
 np.add.at(grad,ids[:,0],f);np.add.at(grad,ids[:,1],-f)
 # Gentle tether to preserve overall T-shirt orientation / front-back identity.
 deviation=p-base
 en+=.5*pose_weight*np.sum(deviation**2)
 grad+=pose_weight*deviation
 # Strap shoulders to stable skeleton attachment positions.
 anchored=deviation[anchors]
 en+=.5*anchor_weight*np.sum(anchored**2)
 np.add.at(grad,anchors,anchor_weight*anchored)
 # Torso elliptical solid at each height, with ~1 cm safety gap.
 x,y,z=p[:,0],p[:,1],p[:,2]
 rx,ry=torso_radii(z)
 nx=x/(rx+clearance);ny=y/(ry+clearance)
 radial=np.maximum(np.sqrt(nx*nx+ny*ny),1e-6)
 inside=(z>.75)&(z<1.48)&(radial<1.)
 # For near-origin points avoid symmetry-induced zero gradient.
 gx=np.where(np.abs(x)>1e-8,x,0.0001)/np.maximum(rx+clearance,1e-6)**2/radial
 gy=np.where(np.abs(y)>1e-8,y,0.0001)/np.maximum(ry+clearance,1e-6)**2/radial
 # Approx signed distance: (radial -1) times mean cylinder radius.
 scale=.5*(rx+ry)
 err=(radial-1)*scale
 en+=.5*collision_weight*np.sum(err[inside]**2)
 grad[inside,0]+=collision_weight*err[inside]*scale[inside]*gx[inside]
 grad[inside,1]+=collision_weight*err[inside]*scale[inside]*gy[inside]
 # Capsule-shaped arms in A pose, with lower-biceps taper.
 for side in (-1,1):
  start=np.array([side*.205,0,1.39]);end=np.array([side*.755,0,.89]);axis=end-start
  t=np.clip(((p-start)@axis)/(axis@axis),0,1)
  centre=start+t[:,None]*axis
  radial_vec=p-centre
  distance=np.maximum(np.linalg.norm(radial_vec,axis=1),1e-8)
  radius=(.062-.023*t)+clearance
  violation=np.minimum(distance-radius,0.)
  active=(np.abs(x)>.20)&(violation<0)
  en+=.5*collision_weight*np.sum(violation[active]**2)
  dg=(collision_weight*violation/distance)[:,None]*radial_vec
  grad[active]+=dg[active]
 return float(en),grad.ravel()


def run(mode='legacy',weight=10000.,anchor=10000.,pose=2.,iters=160):
 base,tri,edge,anchors=build_state(mode)
 fun=lambda xx:energy_gradient(xx,base,edge,anchors,collision_weight=weight,anchor_weight=anchor,pose_weight=pose)
 res=minimize(fun,base.ravel(),jac=True,method='L-BFGS-B',options={'maxiter':iters,'ftol':1e-9,'gtol':1e-5,'maxls':30})
 final=res.x.reshape((-1,3));ti,ai=penetrations(final)
 strained=pattern_stretch_diagnostic(final,[(int(a),int(b),float(r)) for a,b,r in edge])
 move=np.linalg.norm(final-base,axis=1)
 return res,final,tri,{'mode':mode,'k_collision':weight,'k_anchor':anchor,'k_pose':pose,'iterations':res.nit,
      'energy_final':round(float(res.fun),4),
      'optimizer_success':bool(res.success),'contact_pct':round(100*np.mean(ti|ai),2),
      '2d_pattern_severe_edge_pct':round(100*strained['fraction_large_stretch'],2),
      'median_rest_ratio':strained['median_ratio'],
      'max_shift_cm':round(100*np.max(move),2),'mean_shift_cm':round(100*np.mean(move),2)}


def main():
 rows=[]
 for mode in ('legacy','guided'):
  for weight in (4000,12000,40000):
   result,xyz,faces,stats=run(mode,weight=weight,iters=240)
   rows.append(stats)
   name=f'elastic_{mode}_{weight}'
   trimesh.Trimesh(vertices=xyz,faces=faces,process=False).export(OUT/f'{name}.obj')
   print(stats,flush=True)
 (OUT/'optimisation_elastique_synthetique.json').write_text(json.dumps({'warning':'Not Blender; not MPFB; equilibrium of simplified energy only. Not validated cloth dynamics.','results':rows},indent=2),encoding='utf8')

if __name__=='__main__':main()
