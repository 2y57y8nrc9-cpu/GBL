"""No Blender dependency: admission rules, geometry sanity and runner orchestration."""
import json
from pathlib import Path
import unittest
from unittest.mock import patch
import tempfile
import os
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from auto_validation import inspect_report, valid_avatar, find_avatar, run_candidate, CONFIGS
from garmentlab.sewn_geometry import build_sewn_layout
from garmentlab.sewn_mesh import build_stable_sewn_mesh
from garmentlab.preassembled import assemble_sewn_shell
from garmentlab.anatomical_arrangement import AnatomicalArrangement

class AutomatedSelection(unittest.TestCase):
    def setUp(self):
        self.good={
           'assembly_mode':'preassembled', 'assembly_preflight':{'connected_components':1,'nonmanifold_edges':0},
           'avatar':{'landmarks':{'upright_heuristic':True},'collision_enabled':True},
           'fit_preflight':{'aisance_buste_cm':8,'aisance_haut_bras_cm':2},
           'avatar_actual_fit':{'allowed':True,'ease_cm':8.4,'measurements':{'chest_cm':99.6}},
           'final_body_interpenetration':{'fraction_interpenetrating':.002},
           'deformation_diagnostic':{'fraction_large_stretch':.04},
           'pattern_2d_metric_final':{'fraction_large_stretch':.035},
           'pattern_2d_metric_initial':{'fraction_large_stretch':.03},
           'avatar_garment_alignment':{'status':'ok'},
           'temporal_stability':{'stable_by_displacement':True,'checks':[]},
           'quality_status':'candidate_for_visual_review',
           'spatial_diagnostic':{'original_extent_m':[.8,.4,.65], 'final_extent_m':[.79,.41,.68], 'z_span_ratio':1.046},
        }
    def test_numeric_gates_accept_complete_good_report(self):
        self.assertTrue(inspect_report(self.good)['accepted_by_numeric_gates'])
    def test_success_flag_does_not_hide_bad_drape(self):
        r=dict(self.good,success=True,quality_status='drape_non_fiable')
        self.assertFalse(inspect_report(r)['accepted_by_numeric_gates'])
    def test_actual_mpfb_body_measurement_is_required(self):
        r=dict(self.good)
        r.pop('avatar_actual_fit')
        self.assertFalse(inspect_report(r)['accepted_by_numeric_gates'])
    def test_actual_body_fit_blocks_undersized_garment(self):
        r=dict(self.good,avatar_actual_fit={'allowed':False,'ease_cm':-7.4})
        self.assertFalse(inspect_report(r)['accepted_by_numeric_gates'])
    def test_torso_measurements_exclude_arm_contamination(self):
        from test_v361_torso_cross_sections import tube
        from garmentlab.anthropometry import estimate_avatar_girths,compare_pattern_bodice_to_avatar
        vertices=[];faces=[]
        tube(vertices,faces,rx=.18,ry=.135,zlo=.75,zhi=1.43)
        result=estimate_avatar_girths(vertices,1.44,faces)
        self.assertEqual(result['status'],'estimated')
        self.assertTrue(88<result['chest_cm']<115)
        self.assertTrue(compare_pattern_bodice_to_avatar(108,result)['allowed'])
        self.assertFalse(compare_pattern_bodice_to_avatar(92,result)['allowed'])

    def test_bad_preposition_is_not_rescued_by_physics_score(self):
        r=dict(self.good,pattern_2d_metric_initial={'fraction_large_stretch':.095})
        self.assertFalse(inspect_report(r)['accepted_by_numeric_gates'])

    def test_cut_pattern_dimensions_are_required(self):
        r=dict(self.good,pattern_2d_metric_final={'fraction_large_stretch':.18})
        self.assertFalse(inspect_report(r)['accepted_by_numeric_gates'])
    def test_missing_flat_pattern_metric_is_rejected(self):
        r=dict(self.good)
        r.pop('pattern_2d_metric_final')
        self.assertFalse(inspect_report(r)['accepted_by_numeric_gates'])

    def test_unstable_oscillation_is_rejected(self):
        r=dict(self.good,temporal_stability={'stable_by_displacement':False})
        self.assertFalse(inspect_report(r)['accepted_by_numeric_gates'])
    def test_body_penetrations_are_rejected(self):
        r=dict(self.good,final_body_interpenetration={'fraction_interpenetrating':.15})
        self.assertFalse(inspect_report(r)['accepted_by_numeric_gates'])
    def test_missing_metrics_are_rejected(self):
        r=dict(self.good,final_body_interpenetration=None)
        self.assertFalse(inspect_report(r)['accepted_by_numeric_gates'])
    def test_placeholder_avatar_is_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            x=Path(d)/'mock.obj';x.write_text('v 0 0 0\nv 0 0 1\nf 1 2 1\n')
            self.assertFalse(valid_avatar(x))
    def test_pattern_2d_mechanics_are_measured_even_after_seam_weld(self):
        from garmentlab.drape_quality import build_pattern_metric_edges, pattern_stretch_diagnostic
        # Two individual triangles, with a shared stitched edge.
        flat=[(0,0),(1,0),(0,1),(0,0),(1,0),(0,-1)]
        faces=[(0,1,2),(3,4,5)]
        mapping=[0,1,2,0,1,3]
        edges=build_pattern_metric_edges(faces,flat,mapping)
        result=pattern_stretch_diagnostic([(0,0,0),(1,0,0),(0,1,0),(0,-1,0)],edges)
        self.assertEqual(result['fraction_large_stretch'],0)
        result_bad=pattern_stretch_diagnostic([(0,0,0),(10,0,0),(0,1,0),(0,-1,0)],edges)
        self.assertEqual(result_bad['status'],'warning')

    def test_bad_pattern_is_detected(self):
        doc=json.loads((ROOT/'patrons_json'/'01_tshirt_regular_specification.json').read_text())
        layout=build_sewn_layout(doc)
        self.assertEqual(len(layout['panel_loops']),4)
        self.assertEqual(len(layout['seams']),10)
        self.assertLess(layout['summary']['initial_mean_seam_gap_m'],.01)
    def test_a_pose_sleeve_follows_diagonal_arm_and_preserves_cap_seams(self):
        from garmentlab.sewn_geometry import _place
        doc=json.loads((ROOT/'patrons_json'/'01_tshirt_regular_specification.json').read_text())
        panels=doc['pattern']['panels']
        old=os.environ.get('GBL_SLEEVE_POSE')
        try:
            os.environ['GBL_SLEEVE_POSE']='legacy'
            legacy_cuff=_place('manche_droite',0,-58,panels)
            legacy_cap=_place('manche_droite',0,-8,panels)
            os.environ['GBL_SLEEVE_POSE']='a_pose'
            posed_cuff=_place('manche_droite',0,-58,panels)
            posed_cap=_place('manche_droite',0,-8,panels)
        finally:
            if old is None:os.environ.pop('GBL_SLEEVE_POSE',None)
            else:os.environ['GBL_SLEEVE_POSE']=old
        # A-pose target has a hand-outwards, elbow-upwards diagonal arm.
        arm_target=(.72,0.,.97)
        def dist(a,b):return sum((x-y)**2 for x,y in zip(a,b))**.5
        self.assertLess(dist(posed_cuff,arm_target),.1)
        self.assertGreater(dist(legacy_cuff,arm_target),.35)
        self.assertEqual(posed_cap,legacy_cap)

    def test_anatomical_placement_respects_its_own_shift_ceiling(self):
        from test_anatomical_arrangement_v34 import synthetic_a_pose
        body=synthetic_a_pose()
        arr=AnatomicalArrangement(body,1.398,clearance_m=.018,max_shift_m=.06)
        for z in (1.28,1.20,1.12,1.04,.96):
            for x in (-.46,-.34,-.21,.21,.34,.46):
                for y in (-.10,.0,.10):
                    p=(x,y,z);q=arr.place(p)
                    self.assertLessEqual(sum((u-v)**2 for u,v in zip(p,q))**.5,.060001)
        self.assertLessEqual(arr.maximum_displacement,.060001)

    def test_material_refit_moves_penetrating_sheet_outside_plane(self):
        import numpy as np
        from garmentlab.elastic_refit import material_preserving_refit
        v=[(0,0,.02),(.1,0,-.02),(0,.1,-.02),(.1,.1,-.02)]
        edges=[(0,1,.108),(0,2,.108),(1,3,.1),(2,3,.1),(1,2,.1414)]
        def collision(p):
            signed=np.array(p)[:,2]
            normal=np.zeros_like(p,dtype=float)
            normal[:,2]=1.
            return signed,normal
        result=material_preserving_refit(v,edges,[0],collision,iterations=110)
        initial=sum(p[2]<0 for p in v)
        final=sum(p[2]<0 for p in result['vertices'])
        self.assertLess(final,initial)
        self.assertEqual(result['stats']['method'],'material_aware_LBFGS_geometric_preposition_only')

    def test_at_least_two_subdivision_levels_in_candidates(self):
        source=(ROOT/'mac_simulation'/'blender_sewn_garment.py').read_text()
        # A 1-level mesh sometimes becomes nonmanifold after joining.
        self.assertIn("GBL_MESH_LEVELS",source)
        self.assertIn("'2'",source)
        self.assertTrue(all(c['self_collision'] in (0,1) for c in CONFIGS))
    def test_blender_process_is_reported_not_faked(self):
        with tempfile.TemporaryDirectory() as d:
            d=Path(d)
            fake=d/'blender';fake.write_text('#!/bin/sh\nexit 8\n');fake.chmod(0o755)
            avatar=d/'human.obj';avatar.write_text('placeholder')
            rec=run_candidate(fake,avatar,ROOT/'patrons_json'/'01_tshirt_regular_specification.json',d,CONFIGS[0],timeout=5)
            self.assertFalse(rec['accepted_by_numeric_gates'])
            self.assertEqual(rec['blender_exit_code'],8)
            self.assertEqual(rec['score_lower_is_better'],9999)
            self.assertTrue((d/CONFIGS[0]['name']/'blender.log').exists())
    def test_no_blender_does_not_claim_pass(self):
        with tempfile.TemporaryDirectory() as d:
            from auto_validation import find_blender
            with patch('auto_validation.shutil.which',return_value=None),patch('auto_validation.os.access',return_value=False):
                with self.assertRaises(RuntimeError):find_blender(Path(d)/'not_blender')

if __name__=='__main__':unittest.main()
