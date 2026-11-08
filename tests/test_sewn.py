import json
import math
from pathlib import Path
from fastapi.testclient import TestClient
from server import app
from garmentlab.sewn_geometry import build_sewn_layout
from garmentlab.geometry import validate
from garmentlab import mac_native

ROOT = Path(__file__).resolve().parent.parent
CLIENT = TestClient(app)


def _spec(n='01_tshirt_regular_specification.json'):
    return json.loads((ROOT/'patrons_json'/n).read_text())


def test_four_panel_seams_are_explicit_and_paired():
    layout = build_sewn_layout(_spec())
    assert len(layout['panel_loops']) == 4
    assert len(layout['seams']) == 10
    assert len(layout['sewing_pairs']) >= 70
    assert layout['summary']['max_seam_length_mismatch_pct'] == 0
    assert len(layout['pinned']) == 4  # two supported outer shoulders, front and back
    ids = list(range(len(layout['vertices'])))
    assert all(i in ids and j in ids and i != j for i, j in layout['sewing_pairs'])
    assert all(s['paired_vertices'] >= 2 for s in layout['seams'])
    assert len(set(tuple(sorted(p)) for p in layout['sewing_pairs'])) == len(layout['sewing_pairs'])


def test_other_top_variants_and_independent_origins():
    one = build_sewn_layout(_spec('02_tshirt_oversize_specification.json'))
    other = build_sewn_layout(_spec('03_cropped_top_specification.json'))
    assert one['summary']['panel_count'] == 4
    assert other['summary']['panel_count'] == 4
    assert all(all(math.isfinite(x) for x in v) for v in one['vertices'])
    assert one['summary']['initial_mean_seam_gap_m'] > 0


def test_sewn_rejects_wrong_or_missing_topology():
    doc = _spec()
    doc['pattern']['stitches'] = []
    try:
        build_sewn_layout(doc)
    except ValueError as err:
        assert 'couture explicite' in str(err)
    else:
        assert False, 'Expected ValueError'


def test_sewn_endpoint_when_blender_missing(monkeypatch):
    monkeypatch.setattr(mac_native, 'find_blender', lambda: None)
    response = CLIENT.post('/api/mac/sewn', json=_spec())
    assert response.status_code == 503
    assert 'Blender introuvable' in response.json()['detail']


def test_script_has_real_sewing_springs_and_world_fix():
    script = (ROOT/'mac_simulation/blender_sewn_garment.py').read_text()
    assert 'use_sewing_springs = (shell is None)' in script
    assert "bpy.data.worlds.new('GBL World')" in script
    assert 'frame_set(frame)' in script


def test_sewn_endpoint_dispatches_expected_job(tmp_path, monkeypatch):
    from time import sleep
    monkeypatch.setattr(mac_native, 'find_blender', lambda: '/usr/bin/true')
    monkeypatch.setattr(mac_native, 'JOBS_DIR', tmp_path)

    def fake_runner(job, blender, input_path, mode):
        assert mode == 'sewn'
        assert input_path.is_file()
        folder = Path(job['workdir'])
        (folder/'tshirt_cousu.obj').write_text('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n')
        (folder/'rapport_couture.json').write_text(json.dumps({'success': True, 'panels': 4}))
        job.update(status='completed', files=['tshirt_cousu.obj', 'rapport_couture.json'],
                   report={'success': True, 'panels': 4})
        mac_native._persist(job)

    monkeypatch.setattr(mac_native, '_run', fake_runner)
    request = CLIENT.post('/api/mac/sewn', json=_spec())
    assert request.status_code == 200, request.text
    job_id = request.json()['id']
    for i in range(50):
        job = CLIENT.get('/api/mac/jobs/'+job_id).json()
        if job['status'] == 'completed': break
        sleep(0.02)
    assert job['status'] == 'completed'
    assert job['mode'] == 'sewn'
    assert CLIENT.get(f'/api/mac/jobs/{job_id}/file/tshirt_cousu.obj').status_code == 200
