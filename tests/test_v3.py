import base64,io,json
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from garmentlab.v3_photo import normalize,interpret
from garmentlab.v3_build import construct,fidelity_mutate
from garmentlab.v3_avatar import store_obj,valid_avatar
from garmentlab.geometry import validate
from server import app
client=TestClient(app)

def test_default_photo_normalize_unknown_must_not_invent_body():
    a=normalize({'garment_type':'jacket','fit':'oversized','confidence':.72})
    assert a['garment_type']=='jacket'
    assert 'dimensions' not in a
    assert a['uncertainties']

def test_construct_tshirt_sewing_and_body():
    res=construct({'garment_type':'t_shirt','fit':'oversized','sleeves':'short','aesthetic_constraints':['épaule déplacée']},
                  {'height':174,'chest':96,'shoulders':44,'biceps':32,'ease':12})
    assert res['diagnostic']['ok']
    assert res['diagnostic']['summary']['stitches']==10
    assert res['specification']['gbl_v3']['intent_constraints']==['épaule déplacée']
    assert res['specification']['gbl_v3']['photo_measurements_inferred'] is False

def test_refuse_coat_as_tshirt():
    with pytest.raises(ValueError,match='hauts'):
        construct({'garment_type':'jacket'}, {})

def test_mutation_repeatable_and_source_unchanged():
    doc=construct({'garment_type':'t_shirt'}, {})['specification']
    reference=json.dumps(doc,sort_keys=True)
    a=fidelity_mutate(doc,35,2841,['contour','anatomy'])
    b=fidelity_mutate(doc,35,2841,['contour','anatomy'])
    assert a['specification']==b['specification']
    assert json.dumps(doc,sort_keys=True)==reference
    assert 0<a['selection']['intensity']<=35

def test_rest_api_get_and_construct_mutate_acceptance():
    assert client.get('/').status_code==200
    assert 'GARMENT BENDING LAB' in client.get('/').text
    assert client.get('/classic').status_code==200
    assert client.get('/v3/app.js').status_code==200
    response=client.post('/api/v3/construct',json={'analysis':{'garment_type':'t_shirt'},'measurements':{'chest':98}})
    assert response.status_code==200,response.text
    spec=response.json()['specification']
    result=client.post('/api/v3/mutate',json={'specification':spec,'intensity':33,'seed':88,'operators':['contour']})
    assert result.status_code==200,result.text
    checked=client.post('/api/v3/acceptance',json={'specification':result.json()['specification']})
    assert checked.status_code==200
    assert checked.json()['3d_drape']=='not_simulated'

def test_image_endpoint_requires_photo():
    assert client.post('/api/v3/photo',json={'image':'hello'}).status_code==422

def test_obj_upload(tmp_path):
    lines=['o Human']+[f'v {i*.001} {i*.001} 0' for i in range(110)] + ['f 1 2 3']*110
    obj='\n'.join(lines).encode()
    res=client.post('/api/v3/avatar',files={'file':('human.obj',io.BytesIO(obj),'application/octet-stream')})
    assert res.status_code==200,res.text
    assert res.json()['vertices']==110
    assert valid_avatar(res.json()['id'],Path(__file__).resolve().parents[1]/'runs'/'avatars') is not None

def test_validator_does_not_certify_physical():
    doc=construct({'garment_type':'t_shirt'}, {})['specification']
    res=client.post('/api/v3/acceptance',json={'specification':doc}).json()
    assert res['sewing_manufacturability']=='not_certified'

def test_local_vision_mock(monkeypatch):
    from garmentlab import v3_photo
    class FakeResponse:
        def __enter__(self):return self
        def __exit__(self,*args):return False
        def read(self,*args):
            return json.dumps({'message':{'content':json.dumps({'garment_type':'t_shirt','sleeves':'short','fit':'oversized','length':'cropped','aesthetic_constraints':['col décalé'],'confidence':.6})}}).encode()
    monkeypatch.setattr(v3_photo.urllib.request,'urlopen',lambda *a,**k:FakeResponse())
    photo='data:image/jpeg;base64,'+base64.b64encode(b'JPEG' * 40).decode()
    out=v3_photo.interpret(photo,'qwen2.5vl:3b')
    assert out['engine']=='ollama_local_vision'
    assert out['analysis']['garment_type']=='t_shirt'
    assert out['analysis']['confidence']==.6
    assert 'col décalé' in out['analysis']['aesthetic_constraints']
