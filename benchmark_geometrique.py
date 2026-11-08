#!/usr/bin/env python3
"""Offline ONLY: controlled geometry diagnostics without Blender or MPFB.

Requires optional numpy/scipy/shapely/matplotlib for this research experiment.
A procedural synthetic body tests geometry assumptions but is NOT an MPFB avatar
nor a substitute for collision and cloth physics.
"""
from __future__ import annotations
import json,math,sys
from pathlib import Path
from collections import Counter
import numpy as np
from scipy.spatial import Delaunay
from shapely.geometry import Polygon
from garmentlab.sewn_geometry import build_sewn_layout,_place
from garmentlab.sewn_mesh import build_stable_sewn_mesh
from garmentlab.preassembled import assemble_sewn_shell
from garmentlab.anatomical_arrangement import AnatomicalArrangement,seam_distance_report

ROOT=Path(__file__).resolve().parent
OUT=ROOT/'validation_geometrie'


def procedural_avatar_points():
    """Synthetic Z-up 1.75 m body surface points; NOT the user's real MPFB mesh."""
    pts=[]
    for z in np.linspace(.75,1.48,48):
        t=(z-.75)/.73
        rx=.18+.012*math.cos(t*math.pi*2)-.02*math.exp(-((z-1.09)/.12)**2)
        ry=.125+.012*math.sin(t*math.pi)
        for q in np.linspace(0,2*math.pi,72,endpoint=False):
            pts.append((rx*math.cos(q),ry*math.sin(q),float(z)))
    for side in (-1,1):
        for t in np.linspace(0,1,40):
            cx=side*(.205+.55*t);cz=1.39-.5*t;r=.062-.023*t
            for a in np.linspace(0,2*math.pi,32,endpoint=False):
                # radial normal in arm's orthogonal plane (approx)
                pts.append((cx+side*r*.65*math.cos(a),r*math.sin(a),cz+r*.76*math.cos(a)))
    for z in np.linspace(1.43,1.57,12):
        for a in np.linspace(0,2*math.pi,32,endpoint=False):
            pts.append((.05*math.cos(a),.05*math.sin(a),float(z)))
    for theta in np.linspace(0,math.pi,18):
        for phi in np.linspace(0,2*math.pi,36,endpoint=False):
            pts.append((.09*math.sin(theta)*math.cos(phi),.088*math.sin(theta)*math.sin(phi),1.665+.11*math.cos(theta)))
    return pts


def triangulate_layout(layout):
    """Triangulate each planar boundary without crossing the polygon."""
    triangles=[]
    for name,ids in layout['panel_loops'].items():
        xy=np.array([layout['flat_vertices'][i] for i in ids]); poly=Polygon(xy)
        if not poly.is_valid:raise RuntimeError('Panel 2D invalide : '+name)
        cells=Delaunay(xy).simplices
        local=[]
        for cell in cells:
            tri=Polygon(xy[cell])
            if tri.area>1e-11 and poly.buffer(1e-9).covers(tri):
                local.append(tuple(ids[k] for k in cell))
        # No triangles may cross panels or omit any boundary segments.
        if len(local)!=len(ids)-2:
            raise RuntimeError('Delaunay polygon triangulation failed on '+name)
        triangles.extend(local)
    return triangles


def mapping(layout,arranger=None,offset_z=-.02):
    def fn(i,j,uv):
        name=layout['vertex_panel'][i]
        p=_place(name,uv[0]*100,uv[1]*100,layout['source_panels'])
        p=(p[0],p[1],p[2]+offset_z)
        return arranger.place(p) if arranger else p
    return fn


def pattern_strain(prepared):
    u=np.array(prepared['flat_vertices'],dtype=float)
    xyz=np.array(prepared['vertices'],dtype=float)
    faces=np.asarray(prepared['triangles'],int)
    edges=np.array(sorted(set(tuple(sorted((a,b))) for a,b,c in faces for (a,b) in ((a,b),(b,c),(c,a)))),int)
    base=np.linalg.norm(u[edges[:,0]]-u[edges[:,1]],axis=1)
    posed=np.linalg.norm(xyz[edges[:,0]]-xyz[edges[:,1]],axis=1)
    ratio=posed/np.maximum(base,1e-10)
    return {'edge_count':len(ratio),'min':round(float(ratio.min()),3),
            'p05':round(float(np.quantile(ratio,.05)),3),
            'median':round(float(np.median(ratio)),3),
            'p95':round(float(np.quantile(ratio,.95)),3),
            'max':round(float(ratio.max()),3),
            'severe_strain_fraction':round(float(np.mean((ratio<.65)|(ratio>1.5))),4)}


def save_obj(path,vertices,faces):
    with path.open('w') as f:
        f.write('# OFFLINE GEOMETRY PRE-FIT, NOT PHYSICALLY SIMULATED\n')
        for v in vertices:f.write('v %.6f %.6f %.6f\n'%tuple(v))
        for face in faces:f.write('f '+' '.join(str(int(i)+1) for i in face)+'\n')


def run():
    OUT.mkdir(exist_ok=True)
    doc=json.loads((ROOT/'patrons_json'/'01_tshirt_regular_specification.json').read_text())
    layout=build_sewn_layout(doc)
    triangles=triangulate_layout(layout)
    body=procedural_avatar_points()
    arranger=AnatomicalArrangement(body,shoulder_z=1.44)
    initial=[(x,y,z-.02) for x,y,z in layout['vertices']]
    variants={'legacy_pose':None,'synthetic_body_guided':arranger}
    results=[]
    for variant,guide in variants.items():
        print('TEST',variant,flush=True)
        points=[mapping(layout,guide)(i,i,uv) for i,uv in enumerate(layout['flat_vertices'])]
        seam=seam_distance_report(points,layout['sewing_paths'])
        for level in (1,2,3):
            try:
                prepared=build_stable_sewn_mesh(points,triangles,
                    layout['sewing_pairs'],layout['sewing_paths'],layout['pinned'],
                    levels=level,chart_uv=layout['flat_vertices'],
                    surface_map=mapping(layout,guide),vertex_panels=layout['vertex_panel'])
                sewn=assemble_sewn_shell(prepared['vertices'],prepared['triangles'],
                                        prepared['stitch_edges'],prepared['pinned'])
                valid=True;status='PASS';err=None
            except Exception as exc:
                sewn=None;valid=False;status='REJECT';err=str(exc)
            r={'variant':variant,'level':level,'status':status,
               'error':err,'initial_seam_mean_cm':seam['mean_cm'],
               'initial_seam_max_cm':seam['max_cm'],
               'pattern_to_initial_pose':pattern_strain(prepared),
               'shell_topology':sewn['stats'] if sewn else None}
            results.append(r)
            if level==2 and sewn:
                save_obj(OUT/f'preassemblage_{variant}.obj',sewn['vertices'],sewn['triangles'])
            print(level,status,err or sewn['stats']['faces'],flush=True)
    report={'scope':'GEOMETRY ONLY. No Blender physics run. Avatar synthetic, not MPFB.',
            'reference_pattern':'01_tshirt_regular_specification.json',
            'fabric_pattern_not_rescaled':True,'tests':results,
            'blender_validation':'NOT EXECUTED',
            'mpfb_validation':'NOT EXECUTED',
            'conclusion':'Topological tests do not prove stable physically draped garment.'}
    (OUT/'resultats_geometrie.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    return report

if __name__=='__main__':run()
