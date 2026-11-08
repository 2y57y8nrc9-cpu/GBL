"""Regression checks for the user's MPFB upside-down collision failure.

These tests cover geometry and preparation. Blender 5.2 must still be tested on
an actual Apple Silicon Mac to verify physical drape and collisions.
"""
import base64
import json
import math
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from garmentlab.avatar_axis import orientation_evidence
from garmentlab.avatar_registration import body_landmarks
from garmentlab.fitting import fit_reference
from garmentlab.mac_native import launch_blender
from garmentlab import paired_learning
from server import app

ROOT=Path(__file__).resolve().parents[1]


def fake_body(up=True):
    cloud=[]
    for i in range(100):
        z=1.74*i/99
        if z>1.57:
            cx=0.;radius=.091
        elif z<.14:
            cx=.15;radius=.046
        else:
            cx=0.;radius=.19
        for j in range(16):
            theta=2*math.pi*j/16
            if z<.14:
                x=(-1 if j%2 else 1)*cx+radius*math.cos(theta)
            else:
                x=radius*math.cos(theta)
            cloud.append((x,radius*.7*math.sin(theta),z if up else 1.74-z))
    return cloud


def test_avatar_orientation_up_and_down():
    good=orientation_evidence(fake_body(True))
    bad=orientation_evidence(fake_body(False))
    assert good['plausibly_upright'] and not good['inverted']
    assert bad['inverted'] and not bad['plausibly_upright']
    assert body_landmarks(fake_body(False))['orientation_suspected_inverted']


def test_mpfb_obj_import_preserves_z_up():
    script=(ROOT/'mac_simulation/blender_sewn_garment.py').read_text()
    assert 'load_native_mpfb_obj' in script
    assert 'GBL_MPFB_RAW_Z_UP_NO_OBJ_AXIS_CONVERSION' in script
    assert "forward_axis='Y',up_axis='Z'" in script
    assert 'GBL_BODY_SURFACE_CLEARANCE' in script
    assert 'BVHTree.FromPolygons' in script
    assert "cloth.collision_settings.collision_quality = 8" in script
    assert "body.modifiers.new('Collision avatar MPFB'" in script


def test_fitting_preflight_regular_sleeve_is_not_absurd():
    doc=json.loads((ROOT/'patrons_json/01_tshirt_regular_specification.json').read_text())
    fitting=fit_reference(doc)
    assert fitting['tour_haut_manche_cm'] > 32
    assert fitting['aisance_haut_bras_cm'] > -6


def test_preflight_blocks_3cm_sleeve_before_blender(monkeypatch):
    doc=json.loads((ROOT/'patrons_json/01_tshirt_regular_specification.json').read_text())
    for name,panel in doc['pattern']['panels'].items():
        if name.startswith('manche'):
            panel['vertices']=[[x*.08,y] for x,y in panel['vertices']]
    # mock only executable check, no actual task submitted
    monkeypatch.setattr('garmentlab.mac_native.find_blender',lambda:'/bin/echo')
    with pytest.raises(ValueError,match='Manche incompatible'):
        launch_blender(doc,'sewn')


def test_pair_analysis_sends_two_labelled_images(monkeypatch):
    tiny='data:image/png;base64,'+base64.b64encode(b'\x89PNG\r\n\x1a\n'+b'0'*100).decode()
    review={
        'before_description':'T-shirt classique avec manche montée',
        'after_description':'La manche se déplace sur le devant et fusionne au torse',
        'changes':[{'category':'fusion','zone':'emmanchure','description':'Manche déplacée','intensity':.7}]
    }
    captured={}
    class Response:
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def read(self,n):return json.dumps({'message':{'content':json.dumps(review)}}).encode()
    def fake_open(request,timeout):
        captured.update(json.loads(request.data))
        return Response()
    monkeypatch.setattr(paired_learning.urllib.request,'urlopen',fake_open)
    monkeypatch.setattr(paired_learning,'reference_labels',lambda *a,**k:[])
    outcome=paired_learning.analyze_pair(tiny,tiny)
    msgs=captured['messages']
    assert len(msgs)==3
    assert len(msgs[0]['images'])==1 and len(msgs[1]['images'])==1
    assert 'AVANT' in msgs[0]['content'] and 'APRÈS' in msgs[1]['content']
    assert outcome['comparison_quality']=='requires_review'
    assert outcome['review']['human_approved'] is False


def test_pair_identical_descriptions_flag_insufficient(monkeypatch):
    tiny='data:image/png;base64,'+base64.b64encode(b'\x89PNG\r\n\x1a\n'+b'0'*100).decode()
    review={'before_description':'Un même T-shirt noir','after_description':'Un même T-shirt noir','changes':[]}
    class Response:
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def read(self,n):return json.dumps({'message':{'content':json.dumps(review)}}).encode()
    monkeypatch.setattr(paired_learning.urllib.request,'urlopen',lambda req,timeout:Response())
    monkeypatch.setattr(paired_learning,'reference_labels',lambda *a,**k:[])
    out=paired_learning.analyze_pair(tiny,tiny)
    assert out['comparison_quality']=='insufficient'
    assert out['review']['uncertainties']


def test_status_is_v33():
    assert TestClient(app).get('/api/v3/status').json()['version'] in ('3.3','3.4','3.5.1','3.7.0')
