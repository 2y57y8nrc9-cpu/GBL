"""Synthetic-only joint-fit smoke test. Not MPFB and not dynamics."""
import numpy as np
from offline_elastic_relaxation import build_state
from synthetic_contact_experiment import torso_radii
from garmentlab.auto_fit import search_pre_fit

def callback(p):
 p=np.asarray(p,dtype=float);n=len(p)
 x,y,z=p.T
 rx,ry=torso_radii(z)
 R=np.maximum(np.sqrt((x/rx)**2+(y/ry)**2),1e-9)
 gx=x/(rx*rx*R);gy=y/(ry*ry*R)
 norm=np.maximum(np.sqrt(gx*gx+gy*gy),1e-8)
 signed=np.where((z>.75)&(z<1.48),(R-1)/norm,1.0)
 normals=np.column_stack((gx/norm,gy/norm,np.zeros(n)))
 for side in (-1,1):
  s=np.array([side*.205,0,1.39]);e=np.array([side*.755,0,.89]);axis=e-s
  t=np.clip(((p-s)@axis)/(axis@axis),0,1)
  center=s+t[:,None]*axis
  d=p-center
  dist=np.maximum(np.linalg.norm(d,axis=1),1e-8)
  radius=(.062-.023*t)
  v=dist-radius
  valid=(np.abs(x)>.20)&(v<signed)
  signed[valid]=v[valid]
  normals[valid]=d[valid]/dist[valid,None]
 return signed,normals

if __name__=='__main__':
 p,t,e,pins=build_state('guided')
 result=search_pre_fit(p,e,pins,callback,iterations=145)
 print('BEST',result['best'])
 for r in result['all_candidates']:
  print('CANDIDATE',r.get('name'),r.get('accepted_geometry_only'),r.get('severe_2d_edge_fraction'),r.get('penetrating_vertices_fraction'),r.get('maximum_move_cm'),r.get('error'))
 assert result['best']['severe_2d_edge_fraction']<.09
