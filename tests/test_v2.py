from pathlib import Path
import os,json,copy
import pytest
from fastapi.testclient import TestClient
from server import app
from garmentlab.geometry import validate, polygon_area
from garmentlab.mutations import mutate
from garmentlab.library import write_library
from garmentlab import native

ROOT=Path(__file__).resolve().parent.parent
client=TestClient(app)


def get_catalog():
    return json.loads((ROOT/'patrons_json/catalog.json').read_text(encoding='utf8'))


def spec(row):
    return json.loads((ROOT/'patrons_json'/row['file']).read_text(encoding='utf8'))


def test_every_json_has_usable_topology():
    rows=get_catalog()
    assert len(rows)==14 and len({r['id'] for r in rows})==14
    for r in rows:
        d=spec(r);v=validate(d)
        assert v['ok'],(r['file'],v['errors'])
        assert len(v['panels'])==r['panels']
        assert len(v['seams'])==r['stitches']
        assert all(polygon_area(x['vertices'])>0 for x in d['pattern']['panels'].values())
        assert v['summary']['max_mismatch_percent']<.1


def test_regeneration_same_bytes(tmp_path):
    rows=write_library(tmp_path)
    for r in rows:
        assert (tmp_path/r['file']).read_bytes()==(ROOT/'patrons_json'/r['file']).read_bytes()


def test_mutations_are_reproducible_and_keep_original():
    d=spec(get_catalog()[0]);src=copy.deepcopy(d)
    a=mutate(d,75,129,['contour','anatomy'],mode='stable')
    b=mutate(d,75,129,['contour','anatomy'],mode='stable')
    assert a['specification']==b['specification']
    assert a['diagnostic']['ok']
    assert d==src
    assert mutate(d,0,129,['contour'],equalize=False)['specification']==d


def test_api_catalog_import_mutate_and_missing():
    assert client.get('/').status_code==200
    assert client.get('/api/catalog').status_code==200
    assert client.get('/api/pattern/no-such').status_code==404
    d=spec(get_catalog()[0]);check=client.post('/api/validate',json=d)
    assert check.status_code==200
    assert len(check.json()['shape'])==4
    m=client.post('/api/mutate',json={'specification':d,'intensity':55,'seed':9876,'operators':['contour','anatomy'],'mode':'stable'})
    assert m.status_code==200
    assert m.json()['diagnostic']['summary']['stitches']==10


def test_reject_bad_topology():
    d=spec(get_catalog()[0]);d['pattern']['stitches'][0][1]['edge']=900
    v=validate(d)
    assert not v['ok']
    assert client.post('/api/mutate',json={'specification':d}).status_code==422


def test_native_refuses_without_config(monkeypatch):
    monkeypatch.delenv('GBL_GARMENTCODE_DIR',raising=False)
    monkeypatch.delenv('GBL_SIM_CONFIG',raising=False)
    assert client.get('/api/native/status').json()['enabled'] is False
    assert client.post('/api/native/simulate',json=spec(get_catalog()[0])).status_code==503
    assert native.get_job('../../etc/passwd') is None


def test_native_adapter_launches_structured_simulator(tmp_path,monkeypatch):
    # Fake script verifies invocation & status plumbing, NOT physical draping.
    repo=tmp_path/'official_mock';repo.mkdir()
    output=tmp_path/'output';output.mkdir()
    (repo/'system.json').write_text(json.dumps({'output':str(output)}))
    config=tmp_path/'sim.yaml';config.write_text('sim: {}')
    (repo/'test_garment_sim.py').write_text('''\nimport argparse,json,pathlib\np=argparse.ArgumentParser();p.add_argument('-p');p.add_argument('-s');a=p.parse_args()\nx=json.load(open(a.p));assert len(x['pattern']['stitches'])>0\npathlib.Path('''+repr(str(output/'test.obj'))+''').write_text('v 0 0 0\\nv 1 0 0\\nv 0 1 0\\nf 1 2 3\\n')\n''')
    monkeypatch.setenv('GBL_GARMENTCODE_DIR',str(repo))
    monkeypatch.setenv('GBL_SIM_CONFIG',str(config))
    monkeypatch.setenv('GBL_PYTHON',os.sys.executable)
    # Do not touch actual V2 output path for tests; monkeypatch RUNS to temp.
    monkeypatch.setattr(native,'RUNS',tmp_path/'jobs');native.RUNS.mkdir()
    job=native.launch(spec(get_catalog()[0]))
    from time import sleep
    state=None
    for _ in range(200):
        state=native.get_job(job['id'])
        if state['status'] in ('failed','completed'):break
        sleep(.02)
    assert state['status']=='completed',state
    assert state['output_paths'] and state['output_paths'][0].endswith('.obj')
    assert Path(state['log']).is_file()
