from pathlib import Path
from fastapi.testclient import TestClient
import json
import server

ROOT=Path(__file__).resolve().parents[1]

def test_frontend_and_api_have_clo_style_controls():
    c=TestClient(server.app)
    r=c.get('/')
    assert r.status_code==200
    assert 'placementMode' in r.text
    assert 'Volumes anatomiques MPFB' in r.text
    assert c.get('/api/v3/status').json()['version']=='3.7.0'
    js=c.get('/v3/app.js').text
    assert 'placement_mode' in js


def test_api_preserves_mode_and_rejects_unknown_modes(monkeypatch,tmp_path):
    c=TestClient(server.app)
    spec=json.loads((ROOT/'patrons_json/01_tshirt_regular_specification.json').read_text())
    obj=tmp_path/'test_body.obj';obj.write_text('v 0 0 0\n')
    monkeypatch.setattr(server,'valid_avatar',lambda *_:obj)
    seen={}
    def fake_launch(x,mode):
        seen['spec']=x;seen['mode']=mode
        return {'id':'abcdef123456','status':'queued'}
    monkeypatch.setattr(server,'launch_blender',fake_launch)
    response=c.post('/api/v3/simulate',json={'specification':spec,'avatar_id':'dummy','mesh_levels':2,'placement_mode':'body_volumes'})
    assert response.status_code==200,response.text
    assert seen['mode']=='sewn'
    assert seen['spec']['gbl_v3_simulation']['placement_mode']=='body_volumes'
    invalid=c.post('/api/v3/simulate',json={'specification':spec,'avatar_id':'dummy','placement_mode':'hacked'})
    assert invalid.status_code==422
