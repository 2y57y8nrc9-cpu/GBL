"""Tests of original clean-room CLO-like arrangement (no proprietary CLO code)."""
import json
import math
import unittest
from pathlib import Path
from garmentlab.anatomical_arrangement import AnatomicalArrangement, seam_distance_report
from garmentlab.sewn_geometry import build_sewn_layout

ROOT=Path(__file__).resolve().parents[1]


def synthetic_a_pose():
    """Dense torso shell plus separate outstretched upper-arm volumes."""
    pts=[]
    # Torso: variable radius, smooth cross-section, Z up.
    for k in range(75):
        z=.72+.010*k
        f=(z-.72)/.74
        rx=.185 + .025*math.sin(math.pi*f)
        ry=.125 + .02*math.sin(math.pi*f)
        for j in range(160):
            angle=2*math.pi*j/160
            pts.append((rx*math.cos(angle),ry*math.sin(angle),z))
    for side in (-1,1):
        # Sloping arm tubes, A-pose in X/Z.
        for k in range(55):
            t=k/54
            cx=side*(.215+.31*t)
            cz=1.395-.48*t
            for j in range(48):
                angle=2*math.pi*j/48
                pts.append((cx+.052*math.cos(angle),.048*math.sin(angle),cz))
    return pts

class TestCLOInspiredPlacement(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.points=synthetic_a_pose()
        cls.doc=json.loads((ROOT/'patrons_json/01_tshirt_regular_specification.json').read_text())
        cls.layout=build_sewn_layout(cls.doc)

    def test_estimates_avatar_bounding_volumes(self):
        fitter=AnatomicalArrangement(self.points,1.398)
        self.assertGreaterEqual(len(fitter.sections),12)
        section=fitter.envelope(1.15)
        self.assertTrue(.17<section.radius_x<.25)
        self.assertTrue(.10<section.radius_y<.18)
        self.assertEqual(fitter.summary()['method'],'CLO_WORKFLOW_INSPIRED_CLEAN_ROOM_BODY_VOLUMES')

    def test_keeps_seam_correspondences_nearby(self):
        fitter=AnatomicalArrangement(self.points,1.398)
        before=seam_distance_report(self.layout['vertices'],self.layout['sewing_paths'])
        posed=[fitter.place(p) for p in self.layout['vertices']]
        after=seam_distance_report(posed,self.layout['sewing_paths'])
        print('V34 placement reference:',before['mean_cm'],'->',after['mean_cm'],
              'cm; maximum:',after['max_cm'],'cm')
        self.assertLess(after['mean_cm'],2.5)
        self.assertLess(after['max_cm'],7)
        self.assertLess(after['mean_cm'],max(3.,before['mean_cm']*2.5))
        self.assertLessEqual(fitter.maximum_displacement,.170001)

    def test_same_xyz_same_result_even_on_different_panels(self):
        fitter=AnatomicalArrangement(self.points,1.398)
        sample=(.185,.008,1.12)
        self.assertEqual(fitter.place(sample),fitter.place(sample))

    def test_guides_lower_sleeve_towards_a_pose_arm(self):
        fitter=AnatomicalArrangement(self.points,1.398)
        p=(.39,.08,1.08)
        positioned=fitter.place(p)
        self.assertGreater(positioned[0],p[0])
        self.assertLessEqual(abs(positioned[0]-p[0]),.17)
        self.assertEqual(positioned[1:],p[1:])

    def test_invalid_sparse_avatar_rejected(self):
        with self.assertRaises(ValueError):AnatomicalArrangement([(0,0,0)]*2,1.4)

    def test_handles_outside_vertical_range(self):
        fitter=AnatomicalArrangement(self.points,1.398)
        p=(.1,.2,.44)
        self.assertEqual(fitter.place(p),p)

if __name__=='__main__': unittest.main()
