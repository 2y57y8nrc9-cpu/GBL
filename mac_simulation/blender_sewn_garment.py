"""BLENDER-only sewing spring proof of concept: multi-panel GarmentLab JSON.

Arguments: blender -b --python blender_sewn_garment.py -- input.json output_dir

Blender Cloth 'use_sewing_springs' joins boundary vertices with *loose*
(non-face) edges. This is a real physical sewing constraint, NOT a merged
watertight mesh nor calibrated production-grade garment simulation.
Requires explicit stitches; no seam inference from PDF.
"""
import json
import math
import os
import sys
from pathlib import Path
import numbers

import bpy
from mathutils import Vector
from mathutils.geometry import tessellate_polygon
from mathutils.bvhtree import BVHTree
import bmesh

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from garmentlab.sewn_geometry import build_sewn_layout, _place
from garmentlab.sewn_mesh import build_stable_sewn_mesh
from garmentlab.drape_quality import classify_drape, build_pattern_metric_edges, pattern_stretch_diagnostic
from garmentlab.fitting import fit_reference, validate_baseline_fit_for_simulation
from garmentlab.avatar_registration import body_landmarks, align_pattern_layout, validate_anchors
from garmentlab.avatar_axis import orientation_evidence
from garmentlab.anthropometry import estimate_avatar_girths, compare_pattern_bodice_to_avatar
from garmentlab.anatomical_arrangement import AnatomicalArrangement, seam_distance_report
from garmentlab.preassembled import assemble_sewn_shell
from garmentlab.elastic_refit import material_preserving_refit
from garmentlab.prefit_runtime import prefit_settings
from garmentlab.auto_fit import search_pre_fit


def material(name, color):
    m = bpy.data.materials.new(name)
    m.diffuse_color = color
    if m.node_tree is None:
        try:
            m.use_nodes = True  # older Blender only
        except (AttributeError, TypeError):
            pass
    if m.node_tree:
        principled = m.node_tree.nodes.get('Principled BSDF')
        if principled:
            principled.inputs['Base Color'].default_value = color
            principled.inputs['Roughness'].default_value = 0.85
    return m


def collision_ellipsoid(name, loc, scale, mat, actually_collide=True):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=20, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    for face in obj.data.polygons:
        face.use_smooth = True
    if actually_collide:
        collider=obj.modifiers.new('Collision garment', 'COLLISION')
        collider.settings.use=True
        collider.settings.thickness_outer=.008
    return obj


def load_native_mpfb_obj(path):
    """Read ONLY GBL-generated Z-up OBJ files without Blender axis transforms.

    MPFB export_evaluated_body writes raw Blender coordinates: Z is vertical.
    bpy.ops.wm.obj_import defaults to Y-up and can rotate/invert these meshes.
    """
    points=[]; faces=[]
    with Path(path).open('r', encoding='utf8', errors='replace') as file:
        for line in file:
            if line.startswith('v '):
                v=[float(n) for n in line.split()[1:4]]
                if len(v)!=3 or not all(math.isfinite(x) for x in v):
                    raise ValueError('Coordonnées MPFB non finies.')
                points.append(tuple(v))
            elif line.startswith('f '):
                face=[]
                for token in line.split()[1:]:
                    n=int(token.split('/')[0]); idx=n-1 if n>0 else len(points)+n
                    if idx<0 or idx>=len(points):raise ValueError('Face OBJ invalide.')
                    face.append(idx)
                if len(face)>=3:faces.append(face)
            if len(points)>300000 or len(faces)>600000:
                raise ValueError('Avatar MPFB trop volumineux.')
    if len(points)<500 or len(faces)<500:
        raise RuntimeError('Fichier MPFB incomplet : maillage de corps insuffisant.')
    mesh=bpy.data.meshes.new('MPFB · Z-up preserved')
    mesh.from_pydata(points, [], faces)
    mesh.update()
    body=bpy.data.objects.new('Avatar MPFB Z-up',mesh)
    bpy.context.collection.objects.link(body)
    return [body]


def recalc_collision_normals(obj):
    """Orient surface normals coherently before using the avatar as collider."""
    bm=bmesh.new()
    try:
        bm.from_mesh(obj.data)
        bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
        # If the body shell is closed, its signed volume detects inverted faces.
        try:
            signed=bm.calc_volume(signed=True)
            if signed < -1e-8:
                bmesh.ops.reverse_faces(bm,faces=bm.faces)
        except (ValueError,RuntimeError):
            pass
        bm.to_mesh(obj.data)
    finally:
        bm.free()
    obj.data.update()


def import_morphological_avatar(path, target_height=1.74):
    """Load MPFB with correct coordinate axes and a collision-ready surface."""
    native=os.environ.get('GBL_AVATAR_ORIGIN') == 'mpfb_generated_in_gbl'
    if native:
        imported=load_native_mpfb_obj(path)
        import_method='GBL_MPFB_RAW_Z_UP_NO_OBJ_AXIS_CONVERSION'
    else:
        try:
            # Other Z-up Blender-produced OBJ files also need explicit axes.
            bpy.ops.wm.obj_import(filepath=str(path),forward_axis='Y',up_axis='Z')
        except (TypeError,AttributeError):
            bpy.ops.import_scene.obj(filepath=str(path),axis_forward='Y',axis_up='Z')
        imported=[o for o in bpy.context.selected_objects if o.type=='MESH']
        import_method='Z_UP_EXPLICIT_AXES'
    if not imported:raise RuntimeError('Avatar OBJ sans maillage.')
    if max(len(o.data.vertices) for o in imported)<100:
        raise RuntimeError('Avatar OBJ incomplet.')
    def bounds():
        pts=[o.matrix_world@Vector(c) for o in imported for c in o.bound_box]
        return Vector(tuple(min(p[j] for p in pts) for j in range(3))),Vector(tuple(max(p[j] for p in pts) for j in range(3)))
    lo,hi=bounds()
    # Reject ambiguous Y-up OBJ instead of applying an unverified blind 90° turn.
    spans=hi-lo
    if spans.y>spans.z*1.35:
        raise RuntimeError('Avatar Y-up détecté. Exporter un OBJ Z-up depuis MPFB (GBL le fait automatiquement).')
    if not .3<spans.z<1000:raise RuntimeError('Hauteur avatar invalide.')
    from mathutils import Matrix
    scale=Matrix.Scale(target_height/spans.z,4)
    for ob in imported:ob.matrix_world=scale@ob.matrix_world
    lo,hi=bounds()
    shift=Matrix.Translation(Vector((-(lo.x+hi.x)/2,-(lo.y+hi.y)/2,-lo.z)))
    for ob in imported:ob.matrix_world=shift@ob.matrix_world
    body=max(imported,key=lambda ob:len(ob.data.vertices))
    # Make the body collision geometry exactly the same as displayed geometry.
    bpy.context.view_layer.objects.active=body
    bpy.ops.object.select_all(action='DESELECT');body.select_set(True)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    coords=[tuple(v.co) for v in body.data.vertices]
    before=orientation_evidence(coords)
    automatically_flipped=False
    if before['inverted']:
        # An unmistakably inverted body is rotated 180° around its horizontal
        # local axis (and re-grounded), not left for the sewing solver to fix.
        mid=(min(v.co.z for v in body.data.vertices)+max(v.co.z for v in body.data.vertices))/2
        for v in body.data.vertices:
            v.co.y=-v.co.y
            v.co.z=2*mid-v.co.z
        body.data.update();automatically_flipped=True
        coords=[tuple(v.co) for v in body.data.vertices]
    evidence=orientation_evidence(coords)
    if not evidence['plausibly_upright']:
        raise RuntimeError('Orientation MPFB incertaine après import. Simulation bloquée au lieu de laisser le tissu tomber à travers un avatar inversé. Diagnostic: '+json.dumps(evidence))
    recalc_collision_normals(body)
    for poly in body.data.polygons:poly.use_smooth=True
    body.name='Avatar humain MPFB · COLLISION ACTIVE'
    col=body.modifiers.new('Collision avatar MPFB', 'COLLISION')
    col.settings.use=True
    col.settings.thickness_outer=.008
    col.settings.thickness_inner=.005
    world_vertices=[tuple(body.matrix_world@v.co) for v in body.data.vertices]
    landmarks=body_landmarks(world_vertices)
    landmarks['upright_heuristic']=True
    return {'objects':len(imported),'body_vertices':len(body.data.vertices),
            'target_height_m':target_height,'source':os.environ.get('GBL_AVATAR_ORIGIN','external_obj'),
            'landmarks':landmarks,'body_object':body,
            'axis_import_method':import_method,'orientation_before':before,
            'orientation_after':evidence,'automatically_flipped':automatically_flipped,
            'collision_enabled':bool(col.settings.use)}


class HumanSurfaceFit:
    """Move posed garment points OUT of the MPFB body, before simulation.

    This is not a universal garment fitting solver: it reduces severe initial
    interpenetrations that the Blender Cloth engine cannot reliably resolve.
    """
    def __init__(self,body):
        self.body=body
        self.points=[tuple(body.matrix_world @ v.co) for v in body.data.vertices]
        self.bvh=BVHTree.FromPolygons([Vector(v) for v in self.points],
                                      [list(poly.vertices) for poly in body.data.polygons],all_triangles=False)
        self.moved=0;self.max_shift=0.0
        self.shoulder_z=body_landmarks(self.points)['shoulder_estimate_z_m']
        # Arm radial envelopes measured from the ACTUAL MPFB A-pose.
        self.arm_outer={-1:{},1:{}}
        for x,y,z in self.points:
            if .45<z<self.shoulder_z+.06 and abs(y)<.28 and .25<abs(x)<1.0:
                side=-1 if x<0 else 1
                key=int(round(z/.025))
                self.arm_outer[side][key]=max(abs(x),self.arm_outer[side].get(key,0))
    def signed_distance_batch(self, positions):
        """Signed normal approximation against the true MPFB collision mesh.

        Positive = outside, negative = inside. It is deliberately a local BVH
        estimate, not a certified exact signed distance or full-body SDF.
        """
        import numpy as np
        signed=[];normals=[]
        for coords in positions:
            p=Vector(tuple(float(c) for c in coords))
            hit,n,_,distance=self.bvh.find_nearest(p)
            if hit is None or n.length<1e-7 or distance>.25:
                signed.append(1.0);normals.append((0.,0.,0.));continue
            normal=n.normalized()
            signed.append(float((p-hit).dot(normal)))
            normals.append((float(normal.x),float(normal.y),float(normal.z)))
        return np.asarray(signed,dtype=float),np.asarray(normals,dtype=float)

    def clear_joined_shell(self, points, clearance=.012, max_push=.105):
        # Adjust the shared sewn shell against the actual MPFB collision skin.
        # Must run AFTER welding, preserving all sewn borders exactly.
        adjusted=[]; inside_count=0; max_penetration=0.; max_shift=0.
        for coords in points:
            p=Vector(coords)
            hit, normal, _, distance=self.bvh.find_nearest(p)
            if hit is None or normal.length<1e-7:
                adjusted.append(tuple(p));continue
            outward=normal.normalized()
            signed=(p-hit).dot(outward)
            if signed < clearance and distance < max_push+.025:
                penetration=max(0.,-signed)
                if penetration>max_push:
                    raise RuntimeError('Tissu à %.1f cm sous la peau; projection trop grande, vérifier le placement.' % (penetration*100))
                target=hit+outward*clearance
                move=(target-p).length
                adjusted.append(tuple(target))
                if signed<0:inside_count+=1
                max_shift=max(max_shift,move)
                max_penetration=max(max_penetration,penetration)
            else:
                adjusted.append(tuple(p))
        self.shell_clearance={'examined_vertices':len(points),'initial_penetrations':inside_count,
                              'maximum_penetration_cm':round(100*max_penetration,3),
                              'maximum_correction_cm':round(100*max_shift,3),
                              'clearance_cm':round(100*clearance,3),
                              'method':'joined_surface_to_mpfb_body_normals'}
        return adjusted

    def shell_outward_winding(self, points, faces):
        # Welded mesh is consistently oriented, but it may be entirely inside-
        # out. Compare a sample of normals against the actual skin outward
        # normals and reverse ALL faces if the common orientation is inverted.
        positive=negative=0
        step=max(1,len(faces)//180)
        for a,b,c in faces[::step]:
            p1,p2,p3=[Vector(points[i]) for i in (a,b,c)]
            normal=(p2-p1).cross(p3-p1)
            if normal.length<1e-9:continue
            centre=(p1+p2+p3)/3
            hit, skin_normal, _, distance=self.bvh.find_nearest(centre)
            if hit is None or distance>.18 or skin_normal.length<1e-9:continue
            dot=normal.dot(skin_normal)
            if dot>1e-10:positive+=1
            elif dot<-1e-10:negative+=1
        if positive+negative<8:
            # Not enough close-to-body samples to justify a global correction.
            self.shell_winding={'status':'insufficient_contact','positive':positive,'negative':negative,'flipped':False}
            return faces
        flipped=negative>positive
        self.shell_winding={'status':'measured','positive':positive,'negative':negative,'flipped':flipped}
        return [(a,c,b) for a,b,c in faces] if flipped else faces

    def surface_penetrations(self, points, tolerance=.009):
        # Geometry diagnostic of cloth vertices, not a guarantee of triangle-
        # triangle nonintersection or an exact signed distance field.
        checked=inside=0;maximum=0.
        for coords in points:
            p=Vector(coords)
            hit,normal,_,distance=self.bvh.find_nearest(p)
            if hit is None or normal.length<1e-9:continue
            checked+=1
            signed=(p-hit).dot(normal.normalized())
            if signed < -tolerance:
                inside+=1; maximum=max(maximum,-signed)
        return {'examined_vertices':checked,'interpenetrating_vertices':inside,
                'fraction_interpenetrating':round(inside/max(1,checked),4),
                'maximum_estimated_penetration_cm':round(100*maximum,3),
                'tolerance_cm':round(100*tolerance,2),
                'method':'local_avatar_BVH_normal_signed_distance_approximation'}

    def triangle_body_overlaps(self, cloth_vertices, cloth_faces):
        """Count actual cloth/skin triangle intersection candidates via Blender BVH.

        Complements vertex penetration, which misses triangles piercing skin.
        A nonzero count is a diagnostic warning, not a proof of invalidity
        alone (near-contact and BVH numerical tolerances can contribute).
        """
        if not cloth_faces:
            return {'status':'unavailable','intersection_pairs':None}
        try:
            cloth_bvh=BVHTree.FromPolygons(
                [Vector(tuple(map(float,v))) for v in cloth_vertices],
                [tuple(map(int,f)) for f in cloth_faces],all_triangles=False)
            overlaps=self.bvh.overlap(cloth_bvh)
            return {'status':'measured','intersection_pairs':len(overlaps),
                    'intersecting_cloth_faces':len(set(b for _,b in overlaps)),
                    'method':'Blender_BVHTree_triangle_overlap_nonzero_contact_requires_review'}
        except (ValueError,TypeError,RuntimeError) as exc:
            return {'status':'error','reason':str(exc),'intersection_pairs':None}

    def anchor_shoulder(self,point):
        p=Vector(point)
        near,norm,face,dist=self.bvh.find_nearest(p,.16)
        if near is None or dist>.11:
            raise RuntimeError('Un ancrage du T-shirt est éloigné de plus de 11 cm de la véritable épaule MPFB. Simulation refusée.')
        # The shoulder support should sit on the OUTSIDE of the MPFB body.
        anchored=near+norm.normalized()*.018
        self.moved+=1
        self.max_shift=max(self.max_shift,(anchored-p).length)
        return tuple(anchored)

    def arm_center(self,z,side):
        table=self.arm_outer[side]
        k=int(round(z/.025))
        candidates=[(abs(key-k),outer) for key,outer in table.items() if abs(key-k)<=4]
        if not candidates:return None
        candidates.sort(key=lambda v:v[0])
        # Upper-arm radius ~5 cm is a rough positional guide, not a garment size.
        return max(.26,candidates[0][1]-.052)

    def adjust(self,name,point):
        p=Vector(point)
        n=name.lower()
        if any(t in n for t in ('devant','front','dos','back')):
            front=any(t in n for t in ('devant','front'))
            start=Vector((p.x,-2.0 if front else 2.0,p.z))
            direction=Vector((0,1 if front else -1,0))
            hit,normal,idx,dist=self.bvh.ray_cast(start,direction,4.0)
            if hit is not None:
                minimum_y=hit.y + (-.018 if front else .018)
                # Preserve fit/ease if already clearly outside the skin surface.
                new_y=min(p.y,minimum_y) if front else max(p.y,minimum_y)
                # Shoulder seam belongs on top of the shoulder, NOT on the
                # front/back chest planes. Fade the clearance near shoulders.
                weight=min(1.0,max(0.0,(self.shoulder_z-p.z)/.14))
                new_y=p.y+(new_y-p.y)*weight
                if abs(new_y-p.y)>.00001:
                    self.moved+=1;self.max_shift=max(self.max_shift,abs(new_y-p.y))
                    p.y=new_y
        elif any(t in n for t in ('manche','sleeve')):
            side=-1 if 'gauche' in n or 'left' in n else 1
            center=self.arm_center(p.z,side)
            if center is not None:
                down=max(0.,self.shoulder_z-p.z)
                w=min(1.0,down/.37)**2
                # Original educational sleeve pose has a nearly vertical arm.
                # Translate the distal sleeve tube toward the MPFB A-pose arm.
                original_center=.20+.135*min(1.,down/.45)
                shift=max(-.10,min(.22,center-original_center))*w
                p.x+=side*shift
            point_on,normal,idx,dist=self.bvh.find_nearest(p,1.0)
            if point_on is not None and dist<.035:
                outward=p-point_on
                # Nearest-point direction is INWARD if the sleeve starts
                # inside the closed body. Use the collider's outward normal.
                if outward.length < 1e-6 or outward.dot(normal) < 0:
                    outward=normal.copy()
                outward.normalize()
                # Keep a collision clearance around the sleeve contact surface.
                p=point_on+outward*.035
                self.moved+=1;self.max_shift=max(self.max_shift,.035-dist)
        return tuple(p)




def normalized_triangle(tri, polygon, original_xy):
    if all(isinstance(p, numbers.Integral) for p in tri):
        return [int(polygon[int(p)]) for p in tri]
    # Older Blender builds return Vector positions rather than indices.
    ids = []
    for p in tri:
        j = min(range(len(original_xy)), key=lambda k: (original_xy[k] - p).length_squared)
        ids.append(polygon[j])
    return ids


def orient_face_outward(ids, verts, name):
    """Consistent collision-facing normals for wrapped front, back, and sleeves."""
    xyz = [Vector(verts[i]) for i in ids]
    normal = (xyz[1] - xyz[0]).cross(xyz[2] - xyz[0])
    center = (xyz[0] + xyz[1] + xyz[2]) / 3.0
    n = name.lower()
    if 'manche' in n or 'sleeve' in n:
        outward = Vector((-1.0 if ('gauche' in n or 'left' in n) else 1.0, 0.0, 0.0))
    else:
        outward = Vector((center.x / .195**2, center.y / .165**2, 0.0))
    if normal.dot(outward) < 0.0:
        return [ids[0], ids[2], ids[1]]
    return ids


def build_cloth(layout, projector=None, arranger=None, assembly_mode="preassembled"):
    positions = layout['vertices']; loops = layout['panel_loops']
    if arranger is not None:
        # Same anatomical displacement field for every piece. Unlike the old
        # per-panel BVH snap, this does not separate two matching seam points.
        verts=[arranger.place(tuple(map(float,p))) for p in positions]
    else:
        verts = [projector.adjust(layout["vertex_panel"][i], tuple(map(float,p))) if projector else tuple(map(float,p)) for i,p in enumerate(positions)]
    if projector:
        for i in layout['pinned']:
            verts[i]=projector.anchor_shoulder(verts[i])
    tris = []
    groups = []
    for name, loop in loops.items():
        # IMPORTANT: triangulate the ORIGINAL FLAT SEWING PATTERN, never a
        # projection of an already wrapped cylinder! Sleeve seam borders may
        # coincide in 3D by design, so their 3D projected polygon degenerates.
        planar = [Vector((*layout['flat_vertices'][idx], 0.0)) for idx in loop]
        polygons = tessellate_polygon([planar])
        if not polygons:
            raise ValueError('Contour non triangulable : ' + name)
        for tri in polygons:
            ids = normalized_triangle(tri, loop, planar)
            if len(set(ids)) == 3:
                # Some triangulators keep collinear sampled boundary points.
                # Those would create zero-area faces alongside underarm seams.
                a, b, c = [layout['flat_vertices'][idx] for idx in ids]
                flat_twice_area = abs((b[0]-a[0])*(c[1]-a[1])
                                      - (c[0]-a[0])*(b[1]-a[1]))
                if flat_twice_area <= 1e-10:
                    continue
                tris.append(orient_face_outward(ids, verts, name))
                groups.append(name)
    if not tris:
        raise ValueError('Impossible de trianguler les panneaux.')

    # V2.0.7: refine in Python BEFORE building Blender mesh. Never let Blender
    # subdivide/replace the original seam vertices: these indices are the stitch
    # references from GarmentCode JSON and must remain stable.
    def project_onto_body(i, j, uv):
        name = layout['vertex_panel'][i]
        if name != layout['vertex_panel'][j]:
            raise ValueError('Une face relie deux panneaux différents.')
        placed = _place(name, uv[0] * 100, uv[1] * 100, layout['source_panels'])
        delta = layout.get('_avatar_offset', (0., 0., 0.))
        answer=tuple(placed[k]+delta[k] for k in range(3))
        return arranger.place(answer) if arranger is not None else (projector.adjust(name,answer) if projector else answer)

    levels = int(os.environ.get('GBL_MESH_LEVELS', '2'))
    prepared = build_stable_sewn_mesh(
        verts, tris, layout['sewing_pairs'], layout['sewing_paths'], layout['pinned'],
        levels=levels, chart_uv=layout['flat_vertices'],
        surface_map=project_onto_body, vertex_panels=layout['vertex_panel'])
    # Two distinct topology models, never silently mix them:
    # - preassembled: seam borders are SHARED VERTICES before cloth physics.
    #   This is the appropriate stable baseline for a T-shirt already worn.
    # - springs: older loose-edge experimental sewing springs, retained solely
    #   to compare against earlier diagnostic reports.
    if assembly_mode == 'preassembled':
        # Weld only after anatomical arrangement and refinement. All matching
        # seam samples must already be close to one another in 3D space.
        shell = assemble_sewn_shell(prepared['vertices'], prepared['triangles'],
                                   prepared['stitch_edges'], prepared['pinned'])
        mesh_points=shell['vertices']; mesh_faces=shell['triangles']
        # Experimental alternative: solve material rest lengths + body contact
        # jointly, instead of forcing each vertex to the skin one at a time.
        # Testable on synthetic bodies; the *real* result must still be judged
        # by Blender's final geometry/stability metrics.
        elastic_stats=None
        auto_prefit=os.environ.get('GBL_AUTO_PREFIT','1')=='1'
        if auto_prefit:
            if projector is None:
                raise RuntimeError('Le pré-ajustement autonome nécessite un avatar MPFB.')
            flat_constraints=build_pattern_metric_edges(
                prepared['triangles'],prepared['flat_vertices'],shell['old_to_new'])
            search_parameters=prefit_settings(os.environ)
            fitted=search_pre_fit(mesh_points,flat_constraints,shell['pinned'],
                projector.signed_distance_batch,
                iterations=int(os.environ.get('GBL_ELASTIC_ITERATIONS','180')),
                **search_parameters)
            print('GBL_PREFIT_SETTINGS',json.dumps(search_parameters),flush=True)
            report_path=os.environ.get('GBL_AUTO_FIT_REPORT_FILE')
            if report_path:
                Path(report_path).write_text(json.dumps({
                    'accepted_geometry_only':fitted['accepted_geometry_only'],
                    'initial_metric':fitted['initial_metric'],
                    'best':fitted['best'],'candidates':fitted['all_candidates'],
                    'warning':'Static geometric fit only, not physically simulated or validated.'
                },ensure_ascii=False,indent=2),encoding='utf8')
            print('GBL_AUTO_PREFIT_SEARCH',json.dumps({'accepted':fitted['accepted_geometry_only'],
                  'candidates':fitted['all_candidates']},ensure_ascii=False),flush=True)
            if not fitted['accepted_geometry_only']:
                raise RuntimeError('Pré-ajustement rejeté : aucun candidat ne conserve simultanément le patron 2D et le contact avec le corps MPFB.')
            mesh_points=fitted['vertices']
            elastic_stats=dict(fitted['best'],method='autonomous_multi_candidate_material_aware_refit')
            # IMPORTANT: Do not snap each vertex to the skin afterwards.
            # Such a second projection destroyed the material metrics and
            # turned a 3% stretch problem into a 16% one in prior experiments.
            projector.shell_clearance={'method':'joint_2d_metric_collision_optimization',
                'initial_penetrations':None,'maximum_correction_cm':elastic_stats['maximum_move_cm'],
                'note':'Jointly optimized; no second destructive skin projection.'}
            shell['vertices']=mesh_points
            print('GBL_DRESSED_BODY_CLEARANCE',json.dumps(projector.shell_clearance),flush=True)
        else:
            if os.environ.get('GBL_ELASTIC_PREFIT','0')=='1':
                raise RuntimeError('Ancien pré-ajustement non supporté : activer GBL_AUTO_PREFIT=1.')
            if projector is not None:
                mesh_points=projector.clear_joined_shell(mesh_points)
                shell['vertices']=mesh_points
                print('GBL_DRESSED_BODY_CLEARANCE',json.dumps(projector.shell_clearance),flush=True)
        if projector is not None:
            mesh_faces=projector.shell_outward_winding(mesh_points,mesh_faces)
            print('GBL_DRESSED_SHELL_NORMALS',json.dumps(projector.shell_winding),flush=True)
        mesh_stitches=[]; pinned_ids=shell['pinned']
        print('GBL_PREASSEMBLED_SHELL',json.dumps(shell['stats']),flush=True)
    elif assembly_mode == 'springs':
        shell=None
        mesh_points=prepared['vertices'];mesh_faces=prepared['triangles']
        mesh_stitches=prepared['stitch_edges'];pinned_ids=prepared['pinned']
    else:
        raise ValueError('Mode assemblage inconnu: preassembled ou springs.')
    mesh = bpy.data.meshes.new('Garment shell · stitched on avatar' if shell else 'Loose-sewn panels · experimental')
    mesh.from_pydata(mesh_points, mesh_stitches, mesh_faces)
    mesh.update(calc_edges=True)
    seam_indices = prepared['stitch_edges']
    loose = len(seam_indices)
    print('GBL_SEWN_MESH_READY ' + json.dumps(prepared['stats']), flush=True)

    obj = bpy.data.objects.new('T-shirt · panneaux cousus par ressorts', mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material('Jersey de référence / écru', (.78, .79, .77, 1)))
    # Rendering-only smooth normals. Does not change cloth spring lengths.
    for poly in obj.data.polygons:
        poly.use_smooth = True

    # KEY FIX: the cloth's physical rest lengths must come from the 2D pattern,
    # not from our approximate pre-wrapped 3D posing. The Flat 2D shape key is
    # never activated visually; Blender 5.2 Cloth uses it for rest spring lengths.
    bpy.context.view_layer.objects.active = obj
    obj.shape_key_add(name='Prepositionnement 3D', from_mix=False)
    flat_key = None
    if shell is None:
        flat_key = obj.shape_key_add(name='Patron à plat · repos physique', from_mix=False)
        if not prepared['flat_vertices'] or len(prepared['flat_vertices']) != len(flat_key.data):
            raise RuntimeError('Impossible de créer la forme de repos du patron 2D.')
        for i, (u, v) in enumerate(prepared['flat_vertices']):
            flat_key.data[i].co = (float(u), float(v), 0.0)
        flat_key.value = 0.0
        print('GBL_FLAT_REST_SHAPE_READY', len(flat_key.data), flush=True)
    else:
        # One sewn vertex can belong to TWO different 2D pattern charts.
        # Mapping a joined seam vertex to two different 2D rest positions is
        # impossible with Blender's single rest_shape_key coordinate per node.
        # Using that flat key on sewn topology previously caused excessive
        # artificial tension. The posed 3D shell is the cloth rest geometry.
        print('GBL_REST_SHAPE','initial sewn 3D shell; 2D rest metrics diagnostic only',flush=True)

    if pinned_ids:
        vg = obj.vertex_groups.new(name='Soutien temporaire encolure')
        vg.add(pinned_ids, 1.0, 'REPLACE')
    cloth = obj.modifiers.new('Coutures + tissu physique', 'CLOTH')
    cloth.settings.quality = int(os.environ.get('GBL_CLOTH_QUALITY', '10'))
    if not 5 <= cloth.settings.quality <= 18: raise ValueError('Qualité tissu hors plage.')
    if flat_key is not None:
        cloth.settings.rest_shape_key = flat_key
    # Exploratory jersey-like parameters; not calibrated textile lab values.
    cloth.settings.mass = float(os.environ.get('GBL_CLOTH_MASS', '.04'))
    cloth.settings.tension_stiffness = float(os.environ.get('GBL_CLOTH_TENSION', '40'))
    cloth.settings.compression_stiffness = float(os.environ.get('GBL_CLOTH_COMPRESSION', '35'))
    cloth.settings.shear_stiffness = float(os.environ.get('GBL_CLOTH_SHEAR', '20'))
    cloth.settings.bending_stiffness = float(os.environ.get('GBL_CLOTH_BENDING', '.6'))
    cloth.settings.tension_damping = 8.0
    cloth.settings.compression_damping = 8.0
    cloth.settings.shear_damping = 8.0
    cloth.settings.air_damping = float(os.environ.get('GBL_AIR_DAMPING', '2'))
    cloth.settings.use_sewing_springs = (shell is None)
    # Avoid snapping distant panels together in the first simulation frames.
    cloth.settings.sewing_force_max = 1.2
    if pinned_ids:
        cloth.settings.vertex_group_mass = vg.name
    cloth.collision_settings.use_collision = True
    cloth.collision_settings.distance_min = float(os.environ.get('GBL_CLOTH_COLLISION_GAP', '.008'))
    cloth.collision_settings.collision_quality = 8
    if os.environ.get('GBL_CLOTH_COLLISION_QUALITY'):
        cloth.collision_settings.collision_quality = int(os.environ['GBL_CLOTH_COLLISION_QUALITY'])
    # Self-collision is expensive and can destabilise the first CPU prototype.
    cloth.collision_settings.use_self_collision = os.environ.get('GBL_SELF_COLLISION', '1') == '1'
    if cloth.collision_settings.use_self_collision:
        cloth.collision_settings.self_distance_min = .003
        # Blender 5.2 has no `self_collision_quality` RNA property.
        # `collision_quality`, set above, controls collision iterations.
        # Keep self-collisions enabled without setting a removed API property.
    stats=dict(prepared['stats'])
    stats['assembled_shell']=shell['stats'] if shell else None
    stats['elastic_prefit']=elastic_stats if shell else None
    # Pure material metric, never derived from a distorted 3D preplacement.
    stats['_material_edge_constraints']=build_pattern_metric_edges(
        prepared['triangles'],prepared['flat_vertices'],
        shell['old_to_new'] if shell else None)
    return obj, seam_indices, pinned_ids, loose, prepared['flat_vertices'], stats, shell


def grouped_seam_metrics(vertices, seam_paths, seam_labels):
    """Measure EACH declared seam, not just the overall mean.

    Mean gap can hide catastrophically unclosed armhole and sleeve seams.
    Keep original indices unchanged through the index-preserving remesh.
    """
    result = []
    for path, meta in zip(seam_paths, seam_labels):
        distances = [math.dist(vertices[a], vertices[b])
                     for a, b in zip(path['left'], path['right'])]
        if not distances:
            continue
        result.append({
            'seam': path['seam'],
            'left': f"{meta['from'][0]} / bord {meta['from'][1]}",
            'right': f"{meta['to'][0]} / bord {meta['to'][1]}",
            'mean_cm': round(100 * sum(distances) / len(distances), 3),
            'max_cm': round(100 * max(distances), 3),
            'over_3cm_pct': round(100 * sum(d > .03 for d in distances) / len(distances), 2),
            'pair_count': len(distances),
        })
    return result


def spatial_diagnostics(rest, current):
    """Coarse collapse indicator; bounding-box width is not a garment size."""
    def bounds(vertices):
        return [max(p[i] for p in vertices) - min(p[i] for p in vertices)
                for i in range(3)]
    before, after = bounds(rest), bounds(current)
    return {'original_extent_m': [round(v, 4) for v in before],
            'final_extent_m': [round(v, 4) for v in after],
            'x_span_ratio': round(after[0] / max(before[0], 1e-8), 4),
            'z_span_ratio': round(after[2] / max(before[2], 1e-8), 4)}


def gap_metric(vertices, pairs):
    if not pairs:
        return None
    ds = [math.dist(vertices[a], vertices[b]) for a, b in pairs]
    return {'mean_m': round(sum(ds)/len(ds), 5), 'max_m': round(max(ds), 5), 'count': len(ds)}


def stretch_diagnostic(rest, current, faces):
    """Measure relative changes of INTERNAL mesh edge lengths, not seam springs.

    These checks detect collapse/explosions but cannot validate fitting, correct
    sewing direction or textile properties. Excludes loose edges intentionally.
    """
    edges = set()
    for face in faces:
        indices = list(face.vertices)
        for a,b in zip(indices, indices[1:]+indices[:1]):
            edges.add((min(a,b),max(a,b)))
    values = []
    for a,b in edges:
        initial = math.dist(rest[a],rest[b])
        final = math.dist(current[a],current[b])
        if initial > 0.0001:
            values.append(final/initial)
    if not values:
        return {'status':'unknown','reason':'No interior edges'}
    off = sum(v < .65 or v > 1.50 for v in values)
    return {'status':'warning' if off/len(values)>.08 else 'geometry_plausible',
            'edges':len(values),'fraction_large_stretch':round(off/len(values),4),
            'min_length_ratio':round(min(values),3),
            'max_length_ratio':round(max(values),3)}


def improve_saved_view(scene, cloth_obj):
    """Save the Blender scene focused on the garment, not its Area light."""
    bpy.ops.object.select_all(action='DESELECT')
    cloth_obj.select_set(True)
    bpy.context.view_layer.objects.active = cloth_obj
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type != 'VIEW_3D':
                continue
            space = area.spaces.active
            try:
                space.region_3d.view_location = (0.0, 0.0, 1.21)
                space.region_3d.view_distance = 2.0
                space.overlay.show_extras = False
                space.shading.color_type = 'MATERIAL'
            except (AttributeError, TypeError):
                continue

def write_initial_obj(obj, out):
    # Save the sewn garment's frame-1 pose for independent body-fit inspection.
    with out.open('w',encoding='utf8') as file:
        file.write('# Preassembled garment BEFORE cloth simulation\n')
        for vertex in obj.data.vertices:
            p=obj.matrix_world @ vertex.co
            file.write(f'v {p.x:.6f} {p.y:.6f} {p.z:.6f}\n')
        for face in obj.data.polygons:
            file.write('f '+' '.join(str(i+1) for i in face.vertices)+'\n')


def write_obj(ob_eval, evaluated, out):
    with out.open('w', encoding='utf-8') as f:
        f.write('# Garment Bending Lab / Blender Cloth sewn-panel research output\n')
        for p in evaluated.vertices:
            v = ob_eval.matrix_world @ p.co
            f.write(f'v {v.x:.6f} {v.y:.6f} {v.z:.6f}\n')
        for poly in evaluated.polygons:
            f.write('f ' + ' '.join(str(i+1) for i in poly.vertices) + '\n')


def main():
    if '--' not in sys.argv:
        raise RuntimeError('Syntaxe: Blender -b --python blender_sewn_garment.py -- spec.json output_dir')
    args = sys.argv[sys.argv.index('--')+1:]
    if len(args) != 2:
        raise ValueError('Deux arguments requis : JSON et dossier de sortie.')
    source, target = Path(args[0]).resolve(), Path(args[1]).resolve()
    target.mkdir(parents=True, exist_ok=True)
    doc = json.loads(source.read_text(encoding='utf-8'))
    layout = build_sewn_layout(doc)
    fit_preflight = fit_reference(doc)
    print('GBL_PATTERN_FIT_PREFLIGHT', json.dumps(fit_preflight,ensure_ascii=False), flush=True)
    baseline_fit=validate_baseline_fit_for_simulation(fit_preflight)
    print('GBL_BASELINE_FIT_GATE',json.dumps(baseline_fit,ensure_ascii=False),flush=True)
    if not baseline_fit['allowed']:
        raise RuntimeError('Précontrôle de taille : ' + ' '.join(baseline_fit['reasons'])
                           + ' ' + baseline_fit['uncertainty'])

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.gravity = (0, 0, -9.81)
    scene.frame_start = 1
    scene.frame_end = int(os.environ.get('GBL_FRAME_END', '108'))
    if not 48 <= scene.frame_end <= 300:
        raise ValueError('GBL_FRAME_END doit être entre 48 et 300.')
    avatar_stats={'source':'fallback_ellipsoid_proxy','quality':'diagnostic_only'}
    projector=None
    avatar_path=os.environ.get('GBL_AVATAR_OBJ','')
    if avatar_path and Path(avatar_path).is_file():
        cm=doc.get('gbl_v3',{}).get('body_measurements_cm',{})
        target_height=float(cm.get('height',174))/100
        avatar_stats=import_morphological_avatar(Path(avatar_path),target_height)
        projector=HumanSurfaceFit(avatar_stats.pop('body_object'))
        print('GBL_HUMANOID_AVATAR_IMPORTED',json.dumps(avatar_stats),flush=True)
    else:
        skin = material('Avatar de secours · PROXY NON HUMAIN', (.55, .61, .69, 1))
        collision_ellipsoid('Buste · collision', (0, 0, 1.12), (.18, .135, .34), skin)
        collision_ellipsoid('Bassin · collision', (0, 0, .83), (.18, .14, .19), skin)
        collision_ellipsoid('Cou · collision', (0, 0, 1.52), (.055, .055, .11), skin)
        collision_ellipsoid('Tête · visuel', (0, 0, 1.75), (.103, .10, .14), skin, False)
        for side in (-1, 1):
            collision_ellipsoid('Haut du bras · collision', (side*.29, 0, 1.17), (.055, .056, .22), skin)
            collision_ellipsoid('Avant-bras · collision', (side*.335, 0, .89), (.041, .042, .21), skin, True)

    # Strict benchmark: actual MPFB torso geometry, not our old fixed
    # 99.47 cm ellipsoid fitting proxy. Incompatible baseline sizes fail fast.
    avatar_actual_fit=None
    if projector is not None:
        girths=estimate_avatar_girths(projector.points,projector.shoulder_z,
                    faces=[tuple(poly.vertices) for poly in projector.body.data.polygons])
        avatar_actual_fit=compare_pattern_bodice_to_avatar(
            fit_preflight['corsage_total_cm'],girths,min_ease_cm=0.0)
        avatar_actual_fit['measurements']=girths
        print('GBL_MPFB_MEASURED_FIT',json.dumps(avatar_actual_fit,ensure_ascii=False),flush=True)
        if not avatar_actual_fit['allowed']:
            raise RuntimeError('T-shirt témoin trop étroit ou avatar non mesurable selon la surface MPFB: '+str(avatar_actual_fit))

    avatar_registration = {'applied':False,'warning':'Avatar de secours : ajustement morphologique non utilisé.'}
    if avatar_stats.get('landmarks'):
        avatar_registration = align_pattern_layout(layout,avatar_stats['landmarks'])
        print('GBL_AVATAR_REGISTRATION',json.dumps(avatar_registration),flush=True)
        if not avatar_stats['landmarks']['upright_heuristic']:
            print('GBL_AVATAR_ORIENTATION_WARNING: vérifier la pose verticale du corps.',flush=True)
    # Public CLO arrangement concepts: body bounding volumes and anatomical
    # arrangement points. Clean-room implementation from MPFB body vertices.
    arrangement_mode=os.environ.get('GBL_ARRANGEMENT_MODE','body_volumes')
    if arrangement_mode not in ('body_volumes','legacy'):
        raise RuntimeError('Mode de placement non reconnu. Utiliser body_volumes ou legacy.')
    arranger=None
    arrangement_report={'mode':'legacy', 'description':'Ancienne projection de chaque panneau indépendamment'}
    if projector and arrangement_mode=='body_volumes':
        try:
            arranger=AnatomicalArrangement(projector.points,projector.shoulder_z,
                                            clearance_m=float(os.environ.get('GBL_CLEARANCE_M', '.018')),
                                            max_shift_m=float(os.environ.get('GBL_MAX_SHIFT_M', '.06')))
            base=seam_distance_report(layout['vertices'],layout['sewing_paths'])
            arranged=[arranger.place(v) for v in layout['vertices']]
            after=seam_distance_report(arranged,layout['sewing_paths'])
            # Avoid silently using a supposedly enhanced arrangement that
            # worsens the sewable initial pose by a large amount.
            if after['mean_cm'] is not None and base['mean_cm'] is not None and (after['mean_cm'] > max(3.0,base['mean_cm']*2.5)):
                raise RuntimeError('Le placement anatomique éloigne des coutures correspondantes : retour à la pose initiale. ' +
                                   json.dumps({'before':base['mean_cm'],'after':after['mean_cm']}))
            arrangement_report={'mode':'body_volumes','before':base,'after':after,
                                'body_volumes':arranger.summary(),
                                'panel_arrangement':{'corsage_devant':'torso_front','corsage_dos':'torso_back',
                                                     'manche_droite':'right_arm','manche_gauche':'left_arm'}}
            print('GBL_CLO_STYLE_ARRANGEMENT',json.dumps(arrangement_report),flush=True)
        except (RuntimeError,ValueError) as e:
            raise RuntimeError('Pré-placement anatomique impossible : '+str(e))
    assembly_mode=os.environ.get('GBL_ASSEMBLY_MODE','preassembled')
    # The preassembled shell imposes a 6.5 cm safety limit on the joining
    # distance. Check anatomy/fit separately, and report the actual affected
    # seam instead of failing deep inside the Blender mesh generator.
    # Refined seam midpoints are also checked by assemble_sewn_shell below.
    if assembly_mode=='preassembled':
        candidate=[arranger.place(v) for v in layout['vertices']] if arranger else list(layout['vertices'])
        details=grouped_seam_metrics(candidate,layout['sewing_paths'],layout['seams'])
        worst=max(details,key=lambda item:item['max_cm'],default=None)
        if worst and worst['max_cm']>6.5:
            print('GBL_SEAM_JOIN_PRECHECK',json.dumps({'status':'failed','worst':worst,
                   'recommended':'Sélectionner le T-shirt témoin non muté ou ajuster la taille et les bords de couture.'},ensure_ascii=False),flush=True)
            raise RuntimeError('Préassemblage refusé : couture %s vers %s séparée de %.1f cm (> 6.5 cm). '
                               'Ne pas souder de force : vérifier la taille du corsage et le placement anatomique.'
                               % (worst['left'],worst['right'],worst['max_cm']))
    os.environ['GBL_AUTO_FIT_REPORT_FILE']=str(target/'rapport_preajustement_automatique.json')
    obj, pairs, pins, loose, flat_uv, meshing, assembled_shell = build_cloth(
        layout,projector=projector,arranger=arranger,assembly_mode=assembly_mode)
    if projector:
        print("GBL_BODY_SURFACE_CLEARANCE",json.dumps({"adjustments":projector.moved,"max_shift_m":round(projector.max_shift,4)}),flush=True)
    if loose < 4:
        raise RuntimeError('Aucun assemblage suffisant pour une couture multi-panneaux.')
    if assembled_shell:
        write_initial_obj(obj,target/'tshirt_preassemblage.obj')
    rest_vertices = [list(v.co) for v in obj.data.vertices]
    material_edges=meshing.pop('_material_edge_constraints',[])
    initial_material_metric=pattern_stretch_diagnostic(rest_vertices,material_edges)
    print('GBL_PATTERN_2D_METRIC_INITIAL',json.dumps(initial_material_metric),flush=True)
    if initial_material_metric.get('fraction_large_stretch',1.0)>.085:
        raise RuntimeError('Pré-assemblage trop déformé par rapport aux dimensions du patron 2D '
                           '(plus de 8.5 %% d’arêtes altérées) : %.1f %%.'
                           % (100*initial_material_metric['fraction_large_stretch']))
    if assembled_shell:
        merged_indices=assembled_shell['old_to_new']
        remapped_pairs=[(merged_indices[a],merged_indices[b]) for a,b in pairs]
        seam_paths=[dict(path,left=[merged_indices[i] for i in path['left']],
                             right=[merged_indices[i] for i in path['right']]) for path in layout['sewing_paths']]
    else:
        remapped_pairs=pairs
        seam_paths=layout['sewing_paths']
    start = gap_metric(rest_vertices, remapped_pairs)
    start_by_seam = grouped_seam_metrics(rest_vertices, seam_paths, layout['seams'])
    print('GBL_INITIAL_SEAM_GAP', json.dumps(start), flush=True)
    print('GBL_INITIAL_SEAM_DETAILS', json.dumps(start_by_seam, ensure_ascii=False), flush=True)
    if not scene.world:
        scene.world = bpy.data.worlds.new('GBL World')
    scene.world.color = (.18, .18, .18)

    bpy.ops.object.camera_add(location=(1.02, -2.86, 1.42))
    camera = bpy.context.object
    camera.rotation_euler = (Vector((0, 0, 1.13))-camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'; camera.data.ortho_scale = 1.85
    scene.camera = camera
    bpy.ops.object.light_add(type='AREA', location=(-1.5, -1.8, 2.7))
    bpy.context.object.data.energy = 700
    bpy.context.object.data.size = 2.5
    scene.render.resolution_x = 800
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 70
    try:
        scene.render.engine = 'BLENDER_WORKBENCH'
        scene.display.shading.color_type = 'MATERIAL'
    except (ValueError, AttributeError):
        pass

    # Sample the last part of the cloth evolution. A single still frame can
    # conceal shaking, exploding seams or perpetual oscillation.
    temporal_samples = []
    stability_window = {max(1, scene.frame_end - k) for k in (18, 12, 6, 0)}
    for frame in range(1, scene.frame_end + 1):
        scene.frame_set(frame)
        if frame in stability_window:
            dg_sample = bpy.context.evaluated_depsgraph_get()
            eval_obj = obj.evaluated_get(dg_sample)
            sample_mesh = eval_obj.to_mesh(preserve_all_data_layers=False, depsgraph=dg_sample)
            if sample_mesh is None:
                raise RuntimeError('Impossible de lire le tissu pendant le contrôle de stabilité.')
            try:
                temporal_samples.append((frame, [tuple(eval_obj.matrix_world @ v.co) for v in sample_mesh.vertices]))
            finally:
                eval_obj.to_mesh_clear()
        if frame % 12 == 0:
            print('GBL_SEWN_FRAME', frame, flush=True)
    stability_checks=[]
    for (fa, pa), (fb, pb) in zip(temporal_samples, temporal_samples[1:]):
        if len(pa) != len(pb):
            stability_checks.append({'from_frame':fa,'to_frame':fb,'status':'topology_changed'})
            continue
        displacements=sorted(math.dist(a,b) for a,b in zip(pa,pb))
        n=len(displacements)
        stability_checks.append({'from_frame':fa,'to_frame':fb,
            'mean_displacement_cm':round(100*sum(displacements)/max(1,n),4),
            'p95_displacement_cm':round(100*displacements[min(n-1,int(.95*(n-1)))],4),
            'max_displacement_cm':round(100*displacements[-1],4)})
    stable=bool(stability_checks) and all(
        entry.get('mean_displacement_cm',float('inf'))<=1.0 and
        entry.get('p95_displacement_cm',float('inf'))<=2.5
        for entry in stability_checks[-2:])
    temporal_stability={'stable_by_displacement':stable,
       'method':'evaluated_cloth_last_18_frames; no visual-only modifiers',
       'checks':stability_checks,
       'note':'Stabilité approximative; sans preuve de fidélité physique textile.'}
    print('GBL_TEMPORAL_STABILITY',json.dumps(temporal_stability),flush=True)

    dg = bpy.context.evaluated_depsgraph_get()
    ob_eval = obj.evaluated_get(dg)
    evaluated = ob_eval.to_mesh(preserve_all_data_layers=True, depsgraph=dg)
    if evaluated is None:
        raise RuntimeError('Blender n’a pas fourni de maillage évalué du vêtement.')
    final = [list(ob_eval.matrix_world @ v.co) for v in evaluated.vertices]
    end = gap_metric(final, remapped_pairs)
    end_by_seam = grouped_seam_metrics(final, seam_paths, layout['seams'])
    spatial = spatial_diagnostics(rest_vertices, final)
    # Compare to true flat pattern measurements, not to the arbitrarily posed
    # 3D mesh. A distorted pre-fit should not be treated as strain-free cloth.
    flat_rest = [(float(u), float(v), 0.0) for u, v in flat_uv]
    # The joined shell has fewer vertices than the 2D charts. Compare 3D
    # reference to evaluated positions for mechanical strain, separately
    # reporting that it is NOT a flat-pattern metric.
    deformation = stretch_diagnostic(rest_vertices if assembled_shell else flat_rest, final, obj.data.polygons)
    final_material_metric=pattern_stretch_diagnostic(final,material_edges)
    print('GBL_PATTERN_2D_METRIC_FINAL',json.dumps(final_material_metric),flush=True)
    worst_seams = sorted(end_by_seam, key=lambda item: item['max_cm'], reverse=True)[:3]
    quality = classify_drape(deformation, spatial, end_by_seam)
    # A garment growing from 66 cm to over 2 m in vertical bounding extent
    # is a numerical instability / flipped vertex cluster, NOT a proper drape.
    # The former width-only check silently missed this failure mode.
    if spatial.get('z_span_ratio',1) > 1.7:
        quality['quality_status']='drape_non_fiable'
        quality['quality_reasons'].append(
            'Expansion verticale anormale (rapport %.2f) : explosion du maillage.'
            % spatial['z_span_ratio'])
    final_body_contact = projector.surface_penetrations(final) if projector else None
    final_triangle_overlap=(projector.triangle_body_overlaps(
        final,[tuple(poly.vertices) for poly in evaluated.polygons]) if projector else None)
    print('GBL_BODY_TRIANGLE_CONTACT',json.dumps(final_triangle_overlap),flush=True)
    if final_triangle_overlap and final_triangle_overlap.get('intersection_pairs',0)>0:
        quality['quality_status']='drape_non_fiable'
        quality['quality_reasons'].append(
            'Des triangles du tissu traversent potentiellement le corps; contrôle BVH requis.')
    if final_body_contact and final_body_contact['fraction_interpenetrating'] > .01:
        quality['quality_status']='drape_non_fiable'
        quality['quality_reasons'].append('Vêtement encore à l’intérieur du mannequin : %.1f %% des sommets traversent la peau.' % (100*final_body_contact['fraction_interpenetrating']))
    alignment_report = None
    if avatar_stats.get('landmarks'):
        lms=avatar_stats['landmarks']
        bodice_vertices=[(assembled_shell['old_to_new'][i] if assembled_shell else i)
                         for name,ids in layout['panel_loops'].items()
                         if any(word in name.lower() for word in ('devant','dos','front','back'))
                         for i in ids]
        alignment_report=validate_anchors(rest_vertices,final,pins,lms['shoulder_estimate_z_m'],lms['height_m'],
                                          bodice_indices=bodice_vertices,
                                          avatar_upright=lms['upright_heuristic'])
        print('GBL_AVATAR_GARMENT_ALIGNMENT',json.dumps(alignment_report),flush=True)
        if alignment_report['status']=='needs_review' or not lms['upright_heuristic']:
            quality['quality_status']='drape_non_fiable'
            quality['quality_reasons'].append(alignment_report.get('warning') or 'Orientation avatar incertaine.')
    if fit_preflight.get('warnings'):
        quality['quality_status'] = 'drape_non_fiable'
        quality['quality_reasons'].extend(fit_preflight['warnings'])
    if final_material_metric['status'] != 'plausible_geometry_only':
        quality['quality_status']='drape_non_fiable'
        quality['quality_reasons'].append('Le vêtement ne conserve pas les longueurs des arêtes du patron JSON 2D.')
    if not temporal_stability['stable_by_displacement']:
        quality['quality_status']='drape_non_fiable'
        quality['quality_reasons'].append('Le tissu reste en mouvement dans les dernières frames (tremblement / oscillation).')
    quality_ok = quality['quality_status'] == 'candidate_for_visual_review'
    out = target/'tshirt_cousu.obj'
    write_obj(ob_eval, evaluated, out)
    result = {
        'success': bool(quality_ok),  # A finished Blender job is NOT a successful drape unless gates pass.
        'calculation_finished': True,
        'mode': 'blender_sewing_springs_experimental',
        'panels': len(layout['panel_loops']),
        'declared_seams': len(layout['seams']),
        'sewing_springs': (0 if assembled_shell else loose),
        'joined_seam_vertices':(assembled_shell['stats']['welded_vertices'] if assembled_shell else 0),
        'mesh_generation': 'v3_flat_rest_shape_variable_seam_safe_mesh',
        'pattern_rest_shape': ('posed 3D shell (flat pattern comparison not yet supported)' if assembled_shell else '2D chart through Blender Cloth rest_shape_key'),
        'assembly_mode':assembly_mode,
        'seam_topology':('merged shared vertices' if assembled_shell else 'loose sewing springs'),
        'assembly_preflight':(assembled_shell['stats'] if assembled_shell else None),
        'dressed_body_clearance':(projector.shell_clearance if assembled_shell and projector else None),
        'sewn_shell_winding':(projector.shell_winding if assembled_shell and projector else None),
        'final_body_interpenetration':final_body_contact,
        'final_body_triangle_overlap':final_triangle_overlap,
        'seam_gap_interpretation':('zero by shared topology; check cloth strain/body contact' if assembled_shell else 'distance between independent sewn endpoints'),
        'mesh_refinement': meshing,
        'avatar':avatar_stats,
        'initial_collision_clearance':({'adjusted_points':projector.moved,'max_displacement_m':round(projector.max_shift,4)} if projector else None),
        'avatar_registration':avatar_registration,
        'avatar_garment_alignment':alignment_report,
        'visual_surface_smoothing':True,
        'self_collision_enabled':obj.modifiers.get('Coutures + tissu physique').collision_settings.use_self_collision,
        'pinned_points': len(pins),
        'initial_gap': start,
        'initial_gap_by_seam': start_by_seam,
        'final_gap': end,
        'final_gap_by_seam': end_by_seam,
        'worst_seams': worst_seams,
        'spatial_diagnostic': spatial,
        'quality_status': quality['quality_status'],
        'quality_reasons': quality['quality_reasons'],
        'temporal_stability': temporal_stability,
        'pattern_2d_metric_initial': initial_material_metric,
        'pattern_2d_metric_final': final_material_metric,
        'simulation_configuration': {key:val for key,val in os.environ.items() if key.startswith('GBL_') and key not in ('GBL_AVATAR_OBJ',)},
        'deformation_diagnostic': deformation,
        'initial_placement': 'v34_body_volumes_shared_displacement' if arranger is not None else 'legacy_v33_per_panel_projection',
        'clo_style_prearrangement':arrangement_report,
        'fitting_note': 'Référence T-shirt corrigée pour avatar pédagogique. Rendu non garanti par calculs statiques.',
        'fit_preflight': fit_preflight,
        'avatar_actual_fit': avatar_actual_fit,
        'fabrication_validated': False,
        'frame_end': scene.frame_end,
        'cloth_vertices': len(evaluated.vertices),
        'cloth_faces': len(evaluated.polygons),
        'warning': (('Coutures topologiquement assemblées; forme de repos 3D expérimentale. ' if assembled_shell else 'Ressorts de couture, pas d’assemblage topologique permanent. ')
                    + 'Le drapé reste expérimental et peut être irréaliste. '
                    'Un petit écart entre points ne certifie pas une confection. '
                    'Des points d’épaule sont maintenus comme soutien temporaire.'),
        'files': ['tshirt_cousu.obj', 'atelier_tshirt_cousu.blend', 'rapport_couture.json'] + (['tshirt_preassemblage.obj'] if assembled_shell else [])
    }
    if not assembled_shell and start and end and end['mean_m'] > start['mean_m']:
        result['warning'] += ' Les coutures ne se sont PAS rapprochées durant ce calcul.'
    if deformation['status'] == 'warning':
        result['warning'] += ' Déformation interne excessive détectée; drapé non fiable.'
    if not assembled_shell and end and end['mean_m'] > .035:
        result['warning'] += ' Coutures encore éloignées (> 3,5 cm en moyenne).'
    if not quality_ok:
        result['warning'] += ' CALCUL TERMINE, MAIS DRAPE NON FIABLE: consulter worst_seams et quality_reasons.'
    print('GBL_SEAM_DIAGNOSTIC', json.dumps({
        'quality_status': result['quality_status'],
        'worst_seams': worst_seams,
        'spatial_diagnostic': spatial,
        'deformation_diagnostic': deformation,
    }, ensure_ascii=False), flush=True)
    ob_eval.to_mesh_clear()
    # Rendering-only modifiers AFTER physical diagnostics: the simulated cloth
    # remains the same mesh; these modifiers do not improve numerical fit.
    subdiv=obj.modifiers.new('Lissage rendu · pas solveur', 'SUBSURF')
    subdiv.subdivision_type='CATMULL_CLARK'
    subdiv.levels=1
    subdiv.render_levels=1
    thickness=obj.modifiers.new('Épaisseur textile rendu · 1mm', 'SOLIDIFY')
    thickness.thickness=.001
    thickness.offset=-1
    improve_saved_view(scene, obj)
    # Lightweight viewport-style render; it is an inspection image, not PBR fabric.
    try:
        scene.render.filepath=str(target/'tshirt_preview.png')
        scene.render.image_settings.file_format='PNG'
        bpy.ops.render.render(write_still=True)
        result['files'].append('tshirt_preview.png')
    except Exception as exc:
        print('GBL_RENDER_PREVIEW_WARNING',str(exc),flush=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(target/'atelier_tshirt_cousu.blend'))
    (target/'rapport_couture.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print('GBL_SEWN_GARMENT_COMPLETE ' + json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
