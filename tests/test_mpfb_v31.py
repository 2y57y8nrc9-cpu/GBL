import io
import json
from pathlib import Path
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from server import app
from garmentlab import mpfb_auto

client = TestClient(app)


def test_params_defaults_and_safe_normalization():
    p = mpfb_auto.normalize_parameters({'height_cm': 181, 'body_shape': .65})
    assert p['height_cm'] == 181
    assert p['body_shape'] == .65
    assert p['muscle'] == .5
    assert len(p) == 6


@pytest.mark.parametrize('data', [
    {'height_cm': 120}, {'height_cm': 230}, {'body_shape': 1.1},
    {'muscle': 'NaN'}, {'age_shape': 0.1}, {'morphology': True},
    {'unknown': 3}, [3, 4],
])
def test_invalid_parameters_rejected(data):
    with pytest.raises(ValueError):
        mpfb_auto.normalize_parameters(data)


def test_api_status_and_no_manual_obj_control():
    r=client.get('/api/v3/mpfb/status')
    assert r.status_code == 200
    assert r.json()['manual_obj_import_required'] is False
    assert 'Générer / actualiser mon avatar MPFB' in client.get('/').text
    assert 'id="avatarInput"' not in client.get('/').text


def test_generate_without_blender_reports_503(monkeypatch):
    monkeypatch.setattr(mpfb_auto, 'find_blender', lambda: None)
    r=client.post('/api/v3/mpfb/generate',json={'height_cm':174})
    assert r.status_code == 503
    assert 'Blender introuvable' in r.json()['detail']


def test_generate_api_queue_and_cache(monkeypatch, tmp_path):
    tasks=[]
    monkeypatch.setattr(mpfb_auto,'find_blender',lambda:'/fake/bin/Blender')
    monkeypatch.setattr(mpfb_auto, 'WORK',tmp_path/'jobs')
    monkeypatch.setattr(mpfb_auto,'_JOBS',{})
    monkeypatch.setattr(mpfb_auto._POOL,'submit',lambda *args:tasks.append(args))
    a=client.post('/api/v3/mpfb/generate',json={'height_cm':174,'body_shape':.52})
    assert a.status_code==200,a.text
    b=client.post('/api/v3/mpfb/generate',json={'height_cm':174,'body_shape':.52})
    assert b.status_code==200
    assert a.json()['id']==b.json()['id']
    assert b.json()['cached'] is True
    assert len(tasks)==1
    job=client.get('/api/v3/mpfb/jobs/'+a.json()['id']).json()
    assert job['parameters']['body_shape']==.52
    assert job['status']=='queued'
    assert 'workdir' not in job
    assert client.get('/api/v3/mpfb/jobs/../../../../file').status_code in (404,422)
    assert client.get('/api/v3/mpfb/jobs/'+a.json()['id']+'/file/secret.txt').status_code==404


def test_blender_script_references_official_mpfb_api():
    script=Path(__file__).resolve().parents[1]/'mac_simulation'/'mpfb_generate_avatar.py'
    s=script.read_text(encoding='utf-8')
    assert 'HumanService.create_human' in s
    assert 'TargetService.get_default_macro_info_dict' in s
    assert "export_evaluated_body(body,folder/'avatar.obj'" in s
    assert 'GBL_MPFB_ERROR:' in s


def test_simulation_requires_avatar_id():
    from garmentlab.v3_build import construct
    spec=construct({'garment_type':'t_shirt'}, {})['specification']
    r=client.post('/api/v3/simulate',json={'specification':spec,'mesh_levels':2})
    assert r.status_code==422
    assert 'Avatar MPFB requis' in r.json()['detail']


def test_generated_obj_can_be_stored(tmp_path):
    from garmentlab.v3_avatar import store_obj,valid_avatar
    obj=('o MPFBBody\n' + ''.join('v 0 0 %d\n'%i for i in range(110)) + 'f 1 2 3\n'*105).encode()
    info=store_obj(obj,tmp_path)
    assert valid_avatar(info['id'],tmp_path).is_file()
    assert info['vertices']==110


def test_background_blender_adapter_stores_generated_obj(tmp_path, monkeypatch):
    """Exercise the Blender invocation and output handoff with a fake executable.

    This verifies our orchestration, NOT MPFB itself (Blender not installed in CI).
    """
    jobdir=tmp_path/'work'
    jobdir.mkdir()
    monkeypatch.setattr(mpfb_auto,'AVATARS',tmp_path/'avatars')
    class Result:
        returncode=0
    def fake_subprocess(command, cwd, stdout, stderr, timeout, check):
        assert command[:3]==['/Applications/Blender.app/Contents/MacOS/Blender','-b','-t']
        assert 'mpfb_generate_avatar.py' in ' '.join(command)
        (jobdir/'avatar.obj').write_text('o MPFB\n'+''.join(f'v {i/100:.3f} 0 1\n' for i in range(111))+'f 1 2 3\n'*111)
        (jobdir/'avatar_metrics.json').write_text('{"height_m":1.74,"estimated_body_measurements":false}')
        (jobdir/'avatar.png').write_bytes(b'pngtest')
        (jobdir/'avatar.blend').write_bytes(b'blendtest')
        return Result()
    monkeypatch.setattr(mpfb_auto.subprocess,'run',fake_subprocess)
    job={'id':'ab12cd34ef56','status':'queued','workdir':str(jobdir),'parameters':mpfb_auto.normalize_parameters({})}
    (jobdir/'parameters.json').write_text(json.dumps(job['parameters']))
    mpfb_auto._run(job,'/Applications/Blender.app/Contents/MacOS/Blender')
    assert job['status']=='completed',job.get('message')
    assert len(job['avatar_id'])==16
    assert (tmp_path/'avatars'/f"{job['avatar_id']}.obj").is_file()
    assert job['metrics']['height_m']==1.74


def test_blender_failure_exposes_meaningful_log(tmp_path,monkeypatch):
    jobdir=tmp_path/'work';jobdir.mkdir()
    class Result:
        returncode=1
    def fail_subprocess(command, cwd, stdout, stderr, timeout, check):
        stdout.write('GBL_MPFB_ERROR: Extension MPFB absente.\n')
        return Result()
    monkeypatch.setattr(mpfb_auto.subprocess,'run',fail_subprocess)
    job={'id':'abcdef123456','status':'queued','workdir':str(jobdir),'parameters':mpfb_auto.normalize_parameters({})}
    (jobdir/'parameters.json').write_text(json.dumps(job['parameters']))
    mpfb_auto._run(job,'/Applications/Blender.app/Contents/MacOS/Blender')
    assert job['status']=='failed'
    assert 'Extension MPFB absente' in job['message']
    assert (jobdir/'mpfb.log').is_file()
