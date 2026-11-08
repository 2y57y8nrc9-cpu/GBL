"""Regression tests for Blender V3's IndexError during multi-level cloth refinement."""
import json
import math
from pathlib import Path

import pytest

from garmentlab.sewn_geometry import build_sewn_layout, _place
from garmentlab.sewn_mesh import build_stable_sewn_mesh

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize('levels', [1, 2, 3])
def test_refinement_uses_valid_original_panel_indices_at_every_level(levels):
    vertices = [(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0),
                (0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)]
    chart = [(0, 0), (1, 0), (1, 1), (0, 1)] * 2
    panels = ['front'] * 4 + ['back'] * 4
    sew = [(0, 4), (1, 5), (2, 6), (3, 7)]
    paths = [{'left': [0, 1], 'right': [4, 5]},
             {'left': [2, 3], 'right': [6, 7]}]
    calls = []

    def project(i, j, uv):
        # This is the same array-index access that used to crash in V3.
        assert i < len(panels) and j < len(panels)
        assert panels[i] == panels[j]
        calls.append((i, j, uv, panels[i]))
        return (uv[0], uv[1], 0.0 if panels[i] == 'front' else 1.0)

    out = build_stable_sewn_mesh(vertices, [(0, 1, 2), (0, 2, 3),
                                           (4, 5, 6), (4, 6, 7)],
                                 sew, paths, [0], levels=levels,
                                 chart_uv=chart, surface_map=project,
                                 vertex_panels=panels)
    assert calls
    assert len(out['vertices']) > len(vertices)
    assert len(out['triangles']) == 4 * (4 ** levels)
    assert out['vertices'][:len(vertices)] == vertices
    assert out['stats']['unpaired_seam_midpoints'] == 0
    assert len(out['flat_vertices']) == len(out['vertices'])
    assert len(out['stitch_edges']) > len(sew)
    assert all(all(math.isfinite(c) for c in p) for p in out['vertices'])


def test_refinement_rejects_cross_panel_geometry_before_projection():
    with pytest.raises(ValueError, match='panneaux différents'):
        build_stable_sewn_mesh(
            [(0, 0, 0), (1, 0, 0), (0, 1, 0)],
            [(0, 1, 2)], [(0, 1)], [], [],
            chart_uv=[(0, 0), (1, 0), (0, 1)],
            vertex_panels=['front', 'front', 'sleeve'],
            surface_map=lambda i, j, uv: (*uv, 0.0))


@pytest.mark.parametrize('levels', [2, 3])
def test_real_tshirt_panels_survive_recursive_projection(levels):
    spec = json.loads((ROOT / 'patrons_json' / '01_tshirt_regular_specification.json').read_text())
    layout = build_sewn_layout(spec)
    original_count = len(layout['vertices'])
    triangles = []
    # Minimal panel-local fan: sufficient to exercise the metadata indexing
    # independently of Blender's tessellator and of the quality of the faces.
    for name, loop in layout['panel_loops'].items():
        for k in range(1, len(loop) - 1):
            a, b, c = [layout['flat_vertices'][loop[j]] for j in (0, k, k + 1)]
            area = (b[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(b[1]-a[1])
            if abs(area) > 1e-9:
                triangles.append((loop[0], loop[k], loop[k + 1]))

    def project(i, j, uv):
        assert 0 <= i < original_count and 0 <= j < original_count
        name = layout['vertex_panel'][i]
        assert name == layout['vertex_panel'][j]
        return _place(name, uv[0] * 100, uv[1] * 100, layout['source_panels'])

    out = build_stable_sewn_mesh(
        layout['vertices'], triangles, layout['sewing_pairs'],
        layout['sewing_paths'], layout['pinned'], levels=levels,
        chart_uv=layout['flat_vertices'], surface_map=project,
        vertex_panels=layout['vertex_panel'])
    assert out['stats']['refinement_levels'] == levels
    assert out['stats']['refined_vertices'] > original_count
    assert len(out['vertices']) == len(out['flat_vertices'])
    assert len(out['stitch_edges']) >= len(layout['sewing_pairs'])


def test_dropin_patch_without_modifying_blender_script():
    """Only sewn_mesh.py replaced; old V3 Blender call still succeeds."""
    panels = ['front'] * 4 + ['back'] * 4
    original_pts = [(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0),
                    (0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)]
    calls = []

    def old_blender_callback(i, j, uv):
        name = panels[i]
        assert name == panels[j]
        calls.append((i, j))
        return (uv[0], uv[1], 0.0 if name == 'front' else 1.0)

    result = build_stable_sewn_mesh(
        original_pts,
        [(0, 1, 2), (0, 2, 3), (4, 5, 6), (4, 6, 7)],
        [(0, 4), (1, 5), (2, 6), (3, 7)],
        [{'left': [0, 1], 'right': [4, 5]}], [],
        levels=3, chart_uv=[(0, 0), (1, 0), (1, 1), (0, 1)] * 2,
        surface_map=old_blender_callback)
    assert len(result['vertices']) > len(original_pts)
    assert calls and max(max(a, b) for a, b in calls) < len(original_pts)
