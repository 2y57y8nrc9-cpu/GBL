import base64, io, json, math, zipfile
from pathlib import Path
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient
from server import app
from garmentlab import paired_learning as pair
from garmentlab.avatar_registration import body_landmarks, align_pattern_layout, validate_anchors
from garmentlab.sewn_geometry import build_sewn_layout

client=TestClient(app)
TINY_PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==')
IMAGE='data:image/png;base64,'+base64.b64encode(TINY_PNG).decode()


def note(**more):
    result={'garment_family':'T-shirt','before_description':'Top blanc simple','after_description':'Emmanchure décalée',
            'unchanged':['matière blanche','haut court'],'aesthetic_intent':'Décalage ambigu mais presque crédible',
            'changes':[{'category':'anatomy','zone':'épaule','description':'Épaule décalée','intensity':.4}],
            'suggested_operators':['anatomy'],'status':'experimental','human_approved':True}
    result.update(more);return result


def test_pair_approval_required_and_local_storage(tmp_path,monkeypatch):
    monkeypatch.setattr(pair,'BASE',tmp_path/'pairs')
    bad=client.post('/api/v3/pairs',json={'before_image':IMAGE,'after_image':IMAGE,'annotation':note(human_approved=False),'consent_to_local_save':True})
    assert bad.status_code==422
    bad2=client.post('/api/v3/pairs',json={'before_image':IMAGE,'after_image':IMAGE,'annotation':note(),'consent_to_local_save':False})
    assert bad2.status_code==422
    good=client.post('/api/v3/pairs',json={'before_image':IMAGE,'after_image':IMAGE,'annotation':note(),'consent_to_local_save':True})
    assert good.status_code==200,good.text
    id=good.json()['id']
    assert (pair.BASE/id/'before.png').is_file()
    listed=client.get('/api/v3/pairs').json()
    assert listed['count']==1 and listed['trained_weights'] is False
    refs=pair.reference_labels('épaule décalée')
    assert len(refs)==1 and refs[0]['mutations'][0]['category']=='anatomy'
    exported=client.get('/api/v3/pairs/export')
    assert exported.status_code==200 and exported.headers['content-type']=='application/zip'
    with zipfile.ZipFile(io.BytesIO(exported.content)) as z:
        assert len(z.namelist())==4 # images, JSONL, README
        labels=[json.loads(x) for x in z.read('annotations.jsonl').decode().splitlines()]
        assert labels[0]['annotation']['human_approved'] is True
    assert client.delete('/api/v3/pairs/'+id).json()['deleted'] is True
    assert client.get('/api/v3/pairs').json()['count']==0
    assert client.delete('/api/v3/pairs/../../bad').status_code in (404,405)


def test_invalid_images_rejected(tmp_path,monkeypatch):
    monkeypatch.setattr(pair,'BASE',tmp_path/'pairs')
    with pytest.raises(ValueError):pair.image_from_data_url('data:image/jpeg;base64,'+base64.b64encode(b'not an image'*20).decode())
    with pytest.raises(ValueError):pair.save_pair({'before_image':'bad','after_image':IMAGE,'annotation':note(),'consent_to_local_save':True})
    assert not (tmp_path/'pairs').exists()


def test_photo_pair_analysis_is_reviewable(monkeypatch):
    class Response:
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def read(self,n):
            body={'message':{'content':json.dumps(note(human_approved=True))}}
            return json.dumps(body).encode()
    monkeypatch.setattr(pair.urllib.request,'urlopen',lambda req,timeout:Response())
    monkeypatch.setattr(pair,'reference_labels',lambda *a,**kw:[])
    analysis=pair.analyze_pair(IMAGE,IMAGE)
    assert analysis['review']['changes'][0]['category']=='anatomy'
    assert analysis['review']['human_approved'] is False
    assert analysis['requires_human_review'] is True


def test_registration_changes_only_3d_placement(tmp_path):
    source=Path(__file__).resolve().parents[1]/'patrons_json/01_tshirt_regular_specification.json'
    original=json.loads(source.read_text())
    layout=build_sewn_layout(original)
    old_uv=list(layout['flat_vertices'])
    pins=layout['pinned']
    assert pins and len(pins)>=2
    shoulder=sum(layout['vertices'][i][2] for i in pins)/len(pins)
    target=shoulder+.08
    registration=align_pattern_layout(layout,{'shoulder_estimate_z_m':target})
    assert registration['applied'] and abs(registration['offset_z_m']-.08)<.0001
    assert layout['flat_vertices']==old_uv
    assert abs(sum(layout['vertices'][i][2] for i in pins)/len(pins)-target)<.00001
    report=validate_anchors(layout['vertices'],layout['vertices'],pins,target,1.74)
    assert report['status']=='candidate_for_review'
    moved=[(x,y,z-.25) for x,y,z in layout['vertices']]
    report=validate_anchors(layout['vertices'],moved,pins,target,1.74)
    assert report['status']=='needs_review' and report['pin_drift_cm']>20


def test_avatar_landmark_identifies_vertical_body():
    pts=[]
    # Body tube, head smaller, feet spread laterally.
    for h in range(110):
        z=1.74*h/109
        if z>1.60:radius=.07
        elif z<.20: radius=.11
        else:radius=.16
        for j in range(24):
            theta=2*math.pi*j/24
            x=radius*math.cos(theta)
            if z<.15:x+=(.10 if j%2 else -.10)
            pts.append((x,radius*.8*math.sin(theta),z))
    info=body_landmarks(pts)
    assert abs(info['height_m']-1.74)<.001
    assert 1.25<info['shoulder_estimate_z_m']<1.55
    assert info['vertical_axis']=='Z'


def test_v32_html_contains_viewer_and_pair_library():
    html=client.get('/').text
    assert client.get('/api/v3/status').json()['version'] in ('3.3','3.4','3.5.1','3.7.0')
    for marker in ('id="avatarOrbit"','id="pairBefore"','id="pairAfter"','id="pairApproval"','/v3/paired_ui.js'):
        assert marker in html
    assert client.get('/v3/avatar_orbit.js').status_code==200
    assert client.get('/v3/paired_ui.js').status_code==200
