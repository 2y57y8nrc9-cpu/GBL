"""Tests for pre-welded seam topology; do not claim Blender physics validation."""
import json
import math
from collections import Counter
from pathlib import Path

import pytest

from garmentlab.preassembled import assemble_sewn_shell
from garmentlab.sewn_geometry import build_sewn_layout
from garmentlab.sewn_mesh import build_stable_sewn_mesh

ROOT=Path(__file__).resolve().parents[1]


def test_join_two_panels_removes_loose_seam_and_leaves_boundary():
    # Two quads share a loose stitching boundary x=1; dimensions in metres.
    v=[(0,0,0),(1,0,0),(1,1,0),(0,1,0),
       (1.001,0,0),(2,0,0),(2,1,0),(1.001,1,0)]
    triangles=[(0,1,2),(0,2,3),(4,5,6),(4,6,7)]
    shell=assemble_sewn_shell(v,triangles,[(1,4),(2,7)],[2,7])
    assert len(shell['vertices'])==6
    assert shell['stats']['open_boundary_edges']==6
    assert shell['stats']['nonmanifold_edges']==0
    assert shell['pinned']==[shell['old_to_new'][2]]
    assert shell['old_to_new'][1]==shell['old_to_new'][4]
    assert shell['old_to_new'][2]==shell['old_to_new'][7]
    assert len(shell['triangles'])==4


def test_prevent_stitching_distant_panels():
    with pytest.raises(ValueError,match='couture séparée'):
        assemble_sewn_shell([(0,0,0),(.2,0,0),(0,.2,0),(.8,0,0)],
                            [(0,1,2)],[(0,3)],[],max_seam_gap_m=.065)


def test_protect_nonmanifold_topology():
    points=[(0,0,0),(1,0,0),(0,1,0),(0,-1,0),(0,0,1),(.001,0,1)]
    faces=[(0,1,2),(1,0,3),(0,1,4)]
    with pytest.raises(ValueError,match='non-manifold'):
        assemble_sewn_shell(points,faces,[(4,5)],[],max_seam_gap_m=3)


def test_reject_invalid_coordinate():
    with pytest.raises(ValueError,match='non fini'):
        assemble_sewn_shell([(0,0,float('nan')),(0,1,0),(1,0,0)],[(0,1,2)],[(0,1)])


def test_blender_script_runs_welding_before_simulation_and_preserves_old_mode():
    txt=(ROOT/'mac_simulation/blender_sewn_garment.py').read_text()
    assert 'assemble_sewn_shell(' in txt
    assert "assembly_mode == 'preassembled'" in txt
    assert "assembly_mode == 'springs'" in txt
    assert 'cloth.settings.use_sewing_springs = (shell is None)' in txt
    assert 'projector.clear_joined_shell(mesh_points)' in txt
    assert 'GBL_PREASSEMBLED_SHELL' in txt
    assert 'tshirt_preassemblage.obj' in txt
    assert 'remapped_pairs=[(merged_indices[a],merged_indices[b]) for a,b in pairs]' in txt


def test_default_ui_and_server_are_preassembled_with_legacy_option():
    html=(ROOT/'frontend_v3/index.html').read_text()
    js=(ROOT/'frontend_v3/app.js').read_text()
    server=(ROOT/'server.py').read_text()
    runner=(ROOT/'garmentlab/mac_native.py').read_text()
    assert 'id="assemblyMode"' in html
    assert '<option value="preassembled" selected>' in html
    assert '<option value="springs">' in html
    assert "assembly_mode:$('assemblyMode').value" in js
    assert "payload.get('assembly_mode','preassembled')" in server
    assert "env['GBL_ASSEMBLY_MODE']" in runner


def test_tshirt_seam_paths_support_consistent_merges():
    doc=json.loads((ROOT/'patrons_json/01_tshirt_regular_specification.json').read_text())
    layout=build_sewn_layout(doc)
    assert len(layout['sewing_pairs'])>=40
    assert all(len(p['left'])==len(p['right']) for p in layout['sewing_paths'])
    # Stitched endpoints start close to one another in the original placement.
    distances=[math.dist(layout['vertices'][a],layout['vertices'][b])
               for a,b in layout['sewing_pairs']]
    assert max(distances)<.065
