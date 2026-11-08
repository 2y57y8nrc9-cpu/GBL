import json
from pathlib import Path
import pytest
from garmentlab.sewn_geometry import build_sewn_layout
from garmentlab.sewn_mesh import build_stable_sewn_mesh

ROOT = Path(__file__).resolve().parent.parent


def test_triangle_refinement_preserves_original_indices_and_spring_edges():
    points = [(0,0,0),(2,0,0),(2,2,0),(0,2,0),(0,0,1),(2,0,1),(2,2,1),(0,2,1)]
    tris = [(0,1,2),(0,2,3),(4,5,6),(4,6,7)]
    paths = [{'left':[0,1], 'right':[4,5]}, {'left':[2,3], 'right':[6,7]}]
    out = build_stable_sewn_mesh(points,tris,[(0,4),(1,5),(2,6),(3,7)],paths,[0])
    assert out['vertices'][:len(points)] == points
    assert len(out['triangles']) == len(tris)*4
    assert out['pinned'] == [0]
    assert len(out['stitch_edges']) == 6  # four endpoints + two midpoint links
    assert out['stats']['unpaired_seam_midpoints'] == 0
    face_edges = {tuple(sorted((a,b))) for t in out['triangles'] for a,b in ((t[0],t[1]),(t[1],t[2]),(t[2],t[0]))}
    assert not any(tuple(sorted(e)) in face_edges for e in out['stitch_edges'])


@pytest.mark.parametrize('filename',['01_tshirt_regular_specification.json','02_tshirt_oversize_specification.json','03_cropped_top_specification.json'])
def test_json_pattern_seam_paths_have_consistent_endpoints(filename):
    doc = json.loads((ROOT/'patrons_json'/filename).read_text())
    d = build_sewn_layout(doc)
    assert len(d['sewing_paths']) == len(d['seams']) == 10
    assert all(len(p['left']) == len(p['right']) >= 2 for p in d['sewing_paths'])
    assert all(i < len(d['vertices']) for p in d['sewing_paths'] for i in p['left']+p['right'])


def test_missing_sew_edges_are_rejected():
    with pytest.raises(ValueError):
        build_stable_sewn_mesh([(0,0,0),(1,0,0),(0,1,0)], [(0,1,2)], [(0,5)], [], [])


def test_script_avoids_destructive_bmesh_subdivision():
    txt = (ROOT/'mac_simulation/blender_sewn_garment.py').read_text()
    assert 'build_stable_sewn_mesh' in txt
    assert 'bmesh.ops.subdivide_edges' not in txt
    assert 'mesh.from_pydata(mesh_points, mesh_stitches, mesh_faces)' in txt
    assert "'v3_flat_rest_shape_variable_seam_safe_mesh'" in txt
