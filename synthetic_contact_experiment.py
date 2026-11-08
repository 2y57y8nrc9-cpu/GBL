"""Experimental synthetic-body contact projection, NOT Blender simulation."""
from pathlib import Path
import numpy as np
import trimesh
import json
from benchmark_geometrique import triangulate_layout,procedural_avatar_points,mapping
from garmentlab.sewn_geometry import build_sewn_layout
from garmentlab.sewn_mesh import build_stable_sewn_mesh
from garmentlab.preassembled import assemble_sewn_shell
from garmentlab.drape_quality import build_pattern_metric_edges,pattern_stretch_diagnostic
from garmentlab.anatomical_arrangement import AnatomicalArrangement
ROOT=Path(__file__).resolve().parent
OUT=ROOT/'validation_geometrie'


def torso_radii(z):
 t=(z-.75)/.73
 rx=.18+.012*np.cos(t*np.pi*2)-.02*np.exp(-((z-1.09)/.12)**2)
 ry=.125+.012*np.sin(t*np.pi)
 return rx,ry


def penetrations(xyz, clearance=.0):
 p=np.asarray(xyz,dtype=float)
 x,y,z=p[:,0],p[:,1],p[:,2]
 rx,ry=torso_radii(z)
 torso=(z>.75)&(z<1.48)&((x/(rx+clearance))**2+(y/(ry+clearance))**2<1)
 arms=np.zeros(len(p),bool)
 for side in (-1,1):
  start=np.array([side*.205,0,1.39]);end=np.array([side*.755,0,.89]);axis=end-start
  t=np.clip(((p-start)@axis)/(axis@axis),0,1)
  centre=start+np.outer(t,axis);radius=.062-.023*t
  # Only apply upper-arm test outside the torso's centerline, to avoid
  # artificially double-counting shoulder/torso joins.
  inside=(np.linalg.norm(p-centre,axis=1)<radius+clearance)&(np.abs(x)>.20)
  arms|=inside
 return torso,arms


def push_to_body(xyz,clearance=.012,steps=4,max_vertex_shift=.105):
 original=np.asarray(xyz,dtype=float)
 p=original.copy()
 for iteration in range(steps):
  x,y,z=p[:,0],p[:,1],p[:,2]
  rx,ry=torso_radii(z)
  torso,arms=penetrations(p,clearance)
  mask=torso
  if np.any(mask):
   rr=np.sqrt((x/(rx+clearance))**2+(y/(ry+clearance))**2)
   safe=np.maximum(rr,.001)
   factor=1.01/safe
   nx=x*factor;ny=y*factor
   p[mask,0]=nx[mask];p[mask,1]=ny[mask]
  for side in (-1,1):
   start=np.array([side*.205,0,1.39]);end=np.array([side*.755,0,.89]);axis=end-start
   t=np.clip(((p-start)@axis)/(axis@axis),0,1)
   centre=start+np.outer(t,axis);radius=.062-.023*t
   diff=p-centre
   dst=np.linalg.norm(diff,axis=1)
   active=(dst<radius+clearance)&(np.abs(p[:,0])>.2)
   if np.any(active):
    diff[dst<1e-5]=[0,-1,0]
    dst=np.maximum(np.linalg.norm(diff,axis=1),1e-6)
    scaled=centre+diff*((radius+clearance+.002)/dst)[:,None]
    p[active]=scaled[active]
  shift=p-original
  lengths=np.linalg.norm(shift,axis=1)
  overflow=lengths>max_vertex_shift
  if overflow.any():p[overflow]=original[overflow]+shift[overflow]*(max_vertex_shift/lengths[overflow])[:,None]
 return p


def evaluate():
 results=[]
 doc=json.loads((ROOT/'patrons_json'/'01_tshirt_regular_specification.json').read_text())
 layout=build_sewn_layout(doc)
 tris=triangulate_layout(layout)
 for mode in ('legacy_pose','synthetic_body_guided'):
  mesh=trimesh.load(OUT/f'preassemblage_{mode}.obj',process=False)
  x=mesh.vertices
  arranger=AnatomicalArrangement(procedural_avatar_points(),1.44) if mode=='synthetic_body_guided' else None
  points=[mapping(layout,arranger)(i,i,uv) for i,uv in enumerate(layout['flat_vertices'])]
  prepared=build_stable_sewn_mesh(points,tris,layout['sewing_pairs'],layout['sewing_paths'],layout['pinned'],
      levels=2,chart_uv=layout['flat_vertices'],surface_map=mapping(layout,arranger),vertex_panels=layout['vertex_panel'])
  shell=assemble_sewn_shell(prepared['vertices'],prepared['triangles'],prepared['stitch_edges'],prepared['pinned'])
  rest_edges=build_pattern_metric_edges(prepared['triangles'],prepared['flat_vertices'],shell['old_to_new'])
  prior_strain=pattern_stretch_diagnostic(x,rest_edges)
  t,a=penetrations(x)
  result={'mode':mode,'initial_2d_mismatch_pct':round(100*prior_strain['fraction_large_stretch'],2),
        'initial_interpenetration_pct':round(100*np.mean(t|a),2),
          'torso_intersection_pct':round(100*np.mean(t),2),
          'arm_intersection_pct':round(100*np.mean(a),2)}
  for clearance in (.01,.018,.025):
   fixed=push_to_body(x,clearance=clearance)
   ti,ai=penetrations(fixed)
   shift=np.linalg.norm(fixed-x,axis=1)
   label=f'{mode}_projected_{int(clearance*1000)}mm'
   trimesh.Trimesh(vertices=fixed,faces=mesh.faces,process=False).export(OUT/f'{label}.obj')
   after_strain=pattern_stretch_diagnostic(fixed,rest_edges)
   result[label]={'after_interpenetration_pct':round(100*np.mean(ti|ai),2),
                  'after_2d_mismatch_pct':round(100*after_strain['fraction_large_stretch'],2),
                  'max_displacement_cm':round(100*max(shift),2),
                  'mean_displacement_cm':round(100*np.mean(shift),2),
                  'very_large_reposition_pct':round(100*np.mean(shift>.05),2)}
  results.append(result)
 (OUT/'contact_synthetique.json').write_text(json.dumps({'warning':'Synthetic body geometry ONLY, no MPFB or Blender. Models may have self-intersections.','results':results},indent=2),encoding='utf8')
 print(json.dumps(results,indent=2))
if __name__=='__main__':evaluate()
