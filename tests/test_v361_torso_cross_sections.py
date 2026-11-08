"""Regression tests: avoid spurious 143 cm chest from MPFB A-pose arm points."""
import math
import unittest
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from garmentlab.anthropometry import (estimate_avatar_girths,
    torso_mesh_section,compare_pattern_bodice_to_avatar)


def tube(vertices,faces,*,rx,ry,zlo,zhi,cx=0.0,cy=0.0,phase=0.0,steps=38,count=68):
    """Closed triangulated ellipse tube; physically synthetic, used for math tests."""
    start=len(vertices)
    for j in range(steps):
        z=zlo+(zhi-zlo)*j/(steps-1)
        for k in range(count):
            t=2*math.pi*k/count+phase
            vertices.append((cx+rx*math.cos(t),cy+ry*math.sin(t),z))
    for j in range(steps-1):
        for k in range(count):
            a=start+j*count+k;b=start+j*count+(k+1)%count
            c=start+(j+1)*count+k;d=start+(j+1)*count+(k+1)%count
            faces.extend(((a,b,d),(a,d,c)))
    # caps are outside measured planes
    i0=len(vertices);vertices.append((cx,cy,zlo))
    i1=len(vertices);vertices.append((cx,cy,zhi))
    for k in range(count):
        faces.append((i0,start+(k+1)%count,start+k))
        faces.append((i1,start+(steps-1)*count+k,start+(steps-1)*count+(k+1)%count))


class RealMeshSections(unittest.TestCase):
    def test_torso_girth_isolated_from_connected_looking_a_pose_arms(self):
        v=[];f=[]
        tube(v,f,rx=.185,ry=.14,zlo=.70,zhi=1.43)
        # Densely sampled hanging arm tubes with cross sections in the chest
        # band that formerly contaminated the ellipse fit.
        for side in (-1,1):
            tube(v,f,rx=.065,ry=.070,zlo=.78,zhi=1.37,cx=side*.37)
        result=estimate_avatar_girths(v,1.44,f)
        self.assertEqual(result['status'],'estimated',result)
        self.assertTrue(95<result['chest_cm']<109,result)
        self.assertTrue(compare_pattern_bodice_to_avatar(108,result)['allowed'])
        self.assertFalse(compare_pattern_bodice_to_avatar(92,result)['allowed'])
        self.assertGreaterEqual(result['chest_sample_levels'],3)
    def test_large_actual_torso_is_not_silently_resized(self):
        v=[];f=[]
        tube(v,f,rx=.28,ry=.20,zlo=.70,zhi=1.43)
        actual=estimate_avatar_girths(v,1.44,f)
        self.assertEqual(actual['status'],'estimated',actual)
        self.assertGreater(actual['chest_cm'],130)
        self.assertFalse(compare_pattern_bodice_to_avatar(108,actual)['allowed'])
    def test_missing_faces_is_unverified_not_faked(self):
        v=[];f=[]
        tube(v,f,rx=.18,ry=.14,zlo=.7,zhi=1.43)
        result=estimate_avatar_girths(v,1.44)
        self.assertEqual(result['status'],'not_measurable')
        self.assertFalse(compare_pattern_bodice_to_avatar(108,result)['allowed'])
    def test_autovalidation_preflight_avoids_six_redundant_blender_failures(self):
        import tempfile,json
        from auto_validation import preflight_mpfb_sections,write_preflight_failure
        with tempfile.TemporaryDirectory() as d:
            v=[];f=[]
            tube(v,f,rx=.185,ry=.14,zlo=.7,zhi=1.43)
            obj=Path(d)/'human.obj'
            with obj.open('w') as stream:
                for x,y,z in v:stream.write(f'v {x} {y} {z}\n')
                for a,b,c in f:stream.write(f'f {a+1} {b+1} {c+1}\n')
            fitting_doc={'pattern':{'panels':{}}}
            from garmentlab.fitting import fit_reference
            # Reuse actual pattern geometry but deliberately shrink it.
            doc=json.loads((Path(__file__).resolve().parents[1]/'patrons_json'/'01_tshirt_regular_specification.json').read_text())
            self.assertTrue(preflight_mpfb_sections(obj,doc)['allowed'])
            too_small={'allowed':False,'status':'incompatible','reason':'Too small'}
            out=Path(d)/'results';out.mkdir()
            write_preflight_failure(out,too_small,obj,Path(d)/'pattern.json')
            self.assertTrue((out/'rapport_comparatif.html').exists())
            payload=json.loads((out/'resultats.json').read_text())
            self.assertEqual(payload['candidates'],[])
            self.assertEqual(payload['status'],'BLOCKED_BEFORE_BLENDER')

    def test_open_surface_does_not_produce_fake_girth(self):
        v=[];f=[]
        tube(v,f,rx=.18,ry=.14,zlo=.7,zhi=1.43)
        f=[tri for tri in f if not (any(v[i][0]>.175 for i in tri) and any(v[i][1]>.0 for i in tri))]
        result=torso_mesh_section(v,f,1.25)
        self.assertEqual(result['status'],'unverified_slice')

if __name__=='__main__':unittest.main()
