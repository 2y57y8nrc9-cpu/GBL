"""Static geometry checks for the first data-driven correction after the user's report.

Does NOT assert Blender's physical cloth solution is correct.
"""
import json
import math
from pathlib import Path
from garmentlab.sewn_geometry import build_sewn_layout
from garmentlab.sewn_mesh import build_stable_sewn_mesh

ROOT = Path(__file__).resolve().parents[1]


def layout():
    doc=json.loads((ROOT/'patrons_json/01_tshirt_regular_specification.json').read_text())
    return build_sewn_layout(doc)


def seam_gaps(d):
    v=d['vertices']
    return [
        [math.dist(v[a],v[b]) for a,b in zip(path['left'],path['right'])]
        for path in d['sewing_paths']
    ]


def test_tshirt_nearby_shoulders_side_and_underarm():
    d=layout()
    g=seam_gaps(d)
    assert d['summary']['initial_mean_seam_gap_m'] < .05
    assert all(max(g[i]) < .025 for i in [0,1,2,3])
    assert all(max(g[i]) < .005 for i in [6,9])
    assert all(max(g[i]) < .15 for i in [4,5,7,8])


def test_original_flat_uvs_preserved_and_named():
    d=layout()
    assert len(d['vertices'])==len(d['flat_vertices'])==len(d['vertex_panel'])
    for panel,indices in d['panel_loops'].items():
        assert all(d['vertex_panel'][i]==panel for i in indices)
        assert all(len(d['flat_vertices'][i])==2 for i in indices)


def test_no_initial_penetration_at_boundary():
    d=layout()
    colliders=[((0,0,1.12),(.18,.135,.34)), ((0,0,1.52),(.055,.055,.11)),
               *(( (s*.29,0,1.17),(.055,.056,.22)) for s in [-1,1]),
               *(( (s*.335,0,.89),(.041,.042,.21)) for s in [-1,1])]
    for p in d['vertices']:
        for center,radii in colliders:
            norm=sum(((p[i]-center[i])/radii[i])**2 for i in range(3))
            assert norm > .99


def test_curve_mapping_midpoint_is_not_unwrapped_3d_chord():
    # Synthetic curved panel, with its boundary and a cross-panel stitch.
    xyz=[(0,0,0),(1,0,0),(0,0,1), (2,0,0),(3,0,0),(2,0,1)]
    uvs=[(0,0),(1,0),(0,1), (2,0),(3,0),(2,1)]
    def surface(i,j,uv):return (uv[0], .25*math.sin(math.pi*uv[0]), uv[1])
    result=build_stable_sewn_mesh(xyz,[(0,1,2),(3,4,5)],
        [(0,3)], [{'left':[0,1], 'right':[3,4]}],[],
        chart_uv=uvs,surface_map=surface)
    assert len(result['flat_vertices'])==len(result['vertices'])
    # The midpoint of (0,1) is x=.5 and y=.25 on surface, not y=0 chord.
    assert any(abs(v[0]-.5)<1e-6 and abs(v[1]-.25)<1e-6 for v in result['vertices'])
    assert len(result['stitch_edges'])>=1


def test_report_features_are_available_for_blender():
    s=(ROOT/'mac_simulation/blender_sewn_garment.py').read_text()
    assert 'grouped_seam_metrics' in s
    assert "'quality_status'" in s
    assert 'flat_vertices' in s
    assert 'surface_map=project_onto_body' in s
    assert "Avant-bras · collision" in s


def test_user_diagnostic_is_flagged_invalid():
    from garmentlab.drape_quality import classify_drape
    evaluation=classify_drape(
        {'status':'warning','min_length_ratio':.51,'max_length_ratio':3.778},
        {'x_span_ratio':.42451/1.08},
        [{'max_cm':23.288}])
    assert evaluation['quality_status']=='drape_non_fiable'
    assert len(evaluation['quality_reasons'])==3
    assert evaluation['fabrication_validated'] is False


def test_plausible_heuristics_never_claim_clothing_is_validated():
    from garmentlab.drape_quality import classify_drape
    evaluation=classify_drape({'status':'geometry_plausible'}, {'x_span_ratio':.95}, [{'max_cm':1.1}])
    assert evaluation['quality_status']=='candidate_for_visual_review'
    assert evaluation['fabrication_validated'] is False
