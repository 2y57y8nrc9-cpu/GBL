"""Regression for the reported overly narrow sleeves and bad cloth rest lengths.

These tests verify pattern mathematics, not Blender's final simulated drape.
"""
import json
import math
from pathlib import Path
from garmentlab.sewn_geometry import build_sewn_layout
from garmentlab.sewn_mesh import build_stable_sewn_mesh
from garmentlab.fitting import fit_reference
from garmentlab.geometry import validate

ROOT=Path(__file__).resolve().parents[1]


def test_tshirt_bicep_ease_replaces_undersized_original():
    new=json.loads((ROOT/'patrons_json/01_tshirt_regular_specification.json').read_text())
    old=json.loads((ROOT/'patrons_json/01_tshirt_regular_ancienne_geometrie.json').read_text())
    assert fit_reference(old)['aisance_haut_bras_cm'] < -10
    rep=fit_reference(new)
    assert rep['status']=='dimensions_plausibles_non_validees'
    assert 3 < rep['aisance_haut_bras_cm'] < 7
    assert rep['aisance_buste_cm'] > 0
    assert validate(new)['ok']


def test_3d_sleeve_seams_aligned_before_starting_physics():
    spec=json.loads((ROOT/'patrons_json/01_tshirt_regular_specification.json').read_text())
    d=build_sewn_layout(spec)
    assert len(d['pinned'])==4
    for seam in d['sewing_paths']:
        gaps=[math.dist(d['vertices'][a],d['vertices'][b]) for a,b in zip(seam['left'],seam['right'])]
        assert max(gaps)<.03  # <=3cm on all 10 declared seam parts
    assert d['summary']['initial_mean_seam_gap_m']<.006


def test_sewn_mesh_second_level_keeps_all_original_and_stitches():
    pts=[(0,0,0),(2,0,0),(2,2,0),(0,2,0),
         (0,0,1),(2,0,1),(2,2,1),(0,2,1)]
    faces=[(0,1,2),(0,2,3),(4,5,6),(4,6,7)]
    paths=[{'left':[0,1],'right':[4,5]},{'left':[2,3],'right':[6,7]}]
    out=build_stable_sewn_mesh(pts,faces,[(0,4),(1,5),(2,6),(3,7)],paths,[0],levels=2)
    assert out['vertices'][:8]==pts
    assert len(out['triangles'])==64
    assert len(out['stitch_edges'])==10
    assert out['stats']['unpaired_seam_midpoints']==0


def test_blender_consumes_real_flat_pattern_as_rest_shape():
    script=(ROOT/'mac_simulation/blender_sewn_garment.py').read_text()
    assert 'cloth.settings.rest_shape_key = flat_key' in script
    assert 'cloth.settings.use_sewing_springs = (shell is None)' in script
    assert "GBL_MESH_LEVELS', '2'" in script
    assert 'flat_rest = ' in script
    assert "'fit_preflight':" in script
