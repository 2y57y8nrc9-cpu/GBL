"""Regression tests for autonomous material-aware pre-fit; no Blender required."""
import numpy as np
import pytest
from garmentlab.auto_fit import search_pre_fit

def flat_patch():
    p=[(0.,0.,1.),(.1,0.,1.),(.1,.1,1.),(0.,.1,1.)]
    edges=[(0,1,.1),(1,2,.1),(2,3,.1),(3,0,.1),(0,2,2**.5*.1)]
    return p,edges

def test_free_patch_passes_without_changing_pattern():
    p,edges=flat_patch()
    def clear(x):
        n=len(x)
        return np.ones(n),np.zeros((n,3))
    r=search_pre_fit(p,edges,[0],clear,clearances=(.01,),weights=(2000,),iterations=12)
    assert r['accepted_geometry_only']
    assert r['best']['severe_2d_edge_fraction']==0
    assert r['best']['penetrating_vertices_fraction']==0
    assert np.allclose(r['vertices'],p)

def test_persistent_penetration_rejected():
    p,edges=flat_patch()
    def impossible(x):
        return -np.ones(len(x)),np.zeros((len(x),3))
    r=search_pre_fit(p,edges,[0],impossible,clearances=(.01,),weights=(2000,),iterations=12)
    assert not r['accepted_geometry_only']
    assert r['best']['penetrating_vertices_fraction']==1

def test_numpy_metrics_supported():
    p,edges=flat_patch()
    def clear(x):return np.ones(len(x)),np.zeros((len(x),3))
    r=search_pre_fit(np.asarray(p),np.asarray(edges),[],clear,clearances=(.01,),weights=(2000,),iterations=12)
    assert r['best']['accepted_geometry_only']

def test_reject_missing_material_constraints():
    p,_=flat_patch()
    def clear(x):return np.ones(len(x)),np.zeros((len(x),3))
    with pytest.raises(ValueError):search_pre_fit(p,[],[],clear)
