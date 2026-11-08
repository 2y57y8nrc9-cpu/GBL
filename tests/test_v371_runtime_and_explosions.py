"""V3.7.1 regression tests: actual experiment parameters and vertical explosions."""
import os
import pathlib
import sys
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from garmentlab.prefit_runtime import prefit_settings
from auto_validation import CONFIGS, assert_config_is_effective, inspect_report, run_candidate
from test_v36_autonomous_validation import AutomatedSelection

class PrefitRuntimeRegression(unittest.TestCase):
    def test_normal_ui_retains_original_18_candidate_sweep(self):
        c=prefit_settings({})
        self.assertEqual(len(c['weights'])*len(c['clearances'])*len(c['relative_stiffness_exponents']),18)

    def test_six_automated_variants_are_real_variations(self):
        parsed=[assert_config_is_effective(c) for c in CONFIGS]
        self.assertGreaterEqual(len(set(tuple(x.values()) for x in parsed)),4)
        self.assertEqual(parsed[1]['weights'],(30000.,))
        self.assertEqual(parsed[1]['relative_stiffness_exponents'],(1.,))
        self.assertEqual(parsed[1]['clearances'],(.015,))

    def test_invalid_prefit_overrides_fail(self):
        for bad in ('nan','-2','0','99999999','2,'):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                prefit_settings({'GBL_PREFIT_WEIGHTS':bad})

    def test_runner_passes_settings_into_real_blender_environment(self):
        with __import__('tempfile').TemporaryDirectory() as tmp:
            from pathlib import Path
            p=Path(tmp); log=p/'seen_env.txt'; fake=p/'blender'
            fake.write_text('#!/bin/sh\nprintf "%s|%s|%s|%s" "$GBL_PREFIT_WEIGHTS" "$GBL_PREFIT_EXPONENTS" "$GBL_PREFIT_CLEARANCES_MM" "$GBL_AUTO_PREFIT" > "$GBL_TEST_CAPTURE"\nexit 9\n')
            fake.chmod(0o755)
            with patch.dict(os.environ, {'GBL_TEST_CAPTURE':str(log)}):
                outcome=run_candidate(fake,p/'avatar.obj',ROOT/'patrons_json'/'01_tshirt_regular_specification.json',p,CONFIGS[1],timeout=5)
            self.assertEqual(log.read_text(),'30000|1|15|1')
            self.assertFalse(outcome['accepted_by_numeric_gates'])

    def test_large_height_growth_blocks_even_if_other_metrics_good(self):
        sample=AutomatedSelection()
        sample.setUp()
        good=sample.good
        self.assertTrue(inspect_report(good)['accepted_by_numeric_gates'])
        bad=dict(good,spatial_diagnostic={
            'original_extent_m':[.8,.4,.658],
            'final_extent_m':[.8,.41,2.3353],
            'z_span_ratio':3.549})
        evaluated=inspect_report(bad)
        self.assertFalse(evaluated['accepted_by_numeric_gates'])
        self.assertTrue(any('verticale' in b for b in evaluated['blockers']))

if __name__=='__main__':unittest.main()
