import copy
import json
from pathlib import Path
import pytest

from garmentlab.fitting import fit_reference,validate_baseline_fit_for_simulation
from garmentlab.mac_native import launch_blender
from garmentlab.v3_build import construct

ROOT=Path(__file__).resolve().parents[1]

def _reference():
    return json.loads((ROOT/'patrons_json/01_tshirt_regular_specification.json').read_text())

def test_reference_tshirt_passes_conservative_fit_gate():
    fit=fit_reference(_reference())
    assert fit['corsage_total_cm']==108
    assert validate_baseline_fit_for_simulation(fit)['allowed'] is True

def test_reported_92cm_tshirt_is_rejected_without_silently_resizing():
    spec=construct({'garment_type':'t_shirt'},
                   {'chest':80,'ease':12})['specification']
    fit=fit_reference(spec)
    assert fit['corsage_total_cm']==92
    outcome=validate_baseline_fit_for_simulation(fit)
    assert not outcome['allowed']
    assert any('92.0 cm' in reason for reason in outcome['reasons'])
    assert fit_reference(spec)['corsage_total_cm']==92

def test_runner_rejects_too_small_tshirt_before_blender_is_launched(monkeypatch):
    from garmentlab import mac_native
    monkeypatch.setattr(mac_native,'find_blender',lambda:'/usr/local/bin/blender-fiction')
    spec=construct({'garment_type':'t_shirt'},
                   {'chest':80,'ease':12})['specification']
    with pytest.raises(ValueError,match='bloquée avant Blender'):
        launch_blender(spec,'sewn')

def test_can_start_108cm_reference_in_principle_without_actual_blender():
    assert validate_baseline_fit_for_simulation(fit_reference(_reference()))['allowed']

def test_blender_script_has_diagnostics_for_nonmatching_seams():
    script=(ROOT/'mac_simulation/blender_sewn_garment.py').read_text()
    assert 'GBL_SEAM_JOIN_PRECHECK' in script
    assert 'GBL_BASELINE_FIT_GATE' in script
    assert 'worst[\'left\']' in script
