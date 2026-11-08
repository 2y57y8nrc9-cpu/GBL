"""Validation de la préparation spatiale avant couture (sans Blender)."""
import json
import math
from pathlib import Path

from garmentlab.sewn_geometry import build_sewn_layout

ROOT = Path(__file__).resolve().parents[1]


def _layout():
    spec = json.loads((ROOT/'patrons_json'/'01_tshirt_regular_specification.json').read_text())
    return build_sewn_layout(spec)


def test_front_back_panels_wrap_avatar_instead_of_starting_as_flat_planes():
    layout = _layout()
    vertices = layout['vertices']
    front = [vertices[i] for i in layout['panel_loops']['corsage_devant']]
    back = [vertices[i] for i in layout['panel_loops']['corsage_dos']]
    assert max(y for _,y,_ in front) <= 0
    assert min(y for _,y,_ in back) >= 0
    # The front curves around the torso: y varies across the pattern.
    assert max(y for _,y,_ in front)-min(y for _,y,_ in front) > .1
    assert max(y for _,y,_ in back)-min(y for _,y,_ in back) > .1


def test_initial_stitch_gap_is_below_twenty_two_cm():
    # v2.0.7 starts at 39.7 cm average seam gap, which leads to a violent sew.
    layout = _layout()
    assert layout['summary']['initial_mean_seam_gap_m'] < .22
    assert len(layout['sewing_pairs']) > 60


def test_boundary_vertices_begin_outside_avatar_collision_volumes():
    layout = _layout()
    for x,y,z in layout['vertices']:
        torso=(x/.18)**2+(y/.135)**2+((z-1.12)/.34)**2
        arm=((abs(x)-.29)/.055)**2+(y/.056)**2+((z-1.17)/.22)**2
        assert torso >= .99, ('torso penetration', x, y, z)
        assert arm >= .99, ('arm penetration', x, y, z)


def test_normals_and_quality_diagnostics_integrated():
    script=(ROOT/'mac_simulation'/'blender_sewn_garment.py').read_text()
    assert 'orient_face_outward' in script
    assert 'stretch_diagnostic' in script
    assert 'improve_saved_view' in script
    assert 'fabrication_validated' in script
    assert 'use_sewing_springs = (shell is None)' in script
