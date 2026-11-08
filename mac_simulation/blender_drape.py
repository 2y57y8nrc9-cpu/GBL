"""Run ONLY inside Blender's Python: sample 1 imported pattern panel as cloth on a mannequin torso.

This is a controlled first physics test, NOT sewn garment reconstruction. All units are meters.
Args after '--': input_spec.json output_dir
"""
import json
import math
import numbers
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector
from mathutils.geometry import tessellate_polygon


def build_material(name, rgba, roughness=0.8):
    material = bpy.data.materials.new(name)
    material.diffuse_color = rgba
    # Node materials are enabled by default in Blender 4+; avoid deprecated use_nodes.
    if material.node_tree is None:
        try:
            material.use_nodes = True  # fallback for older Blender builds
        except AttributeError:
            pass
    bsdf = material.node_tree.nodes.get('Principled BSDF') if material.node_tree else None
    if bsdf:
        bsdf.inputs['Base Color'].default_value = rgba
        bsdf.inputs['Roughness'].default_value = roughness
    return material


def make_collision_ellipsoid(name, at, scale, material):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=14, location=at)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    obj.modifiers.new('Collision textile', 'COLLISION')
    return obj


def choose_panel(spec):
    panels = spec['pattern']['panels']
    preferred = ['corsage_devant', 'front_bodice', 'front', 'devant', 'bodice_front']
    for key in preferred:
        if key in panels: return key, panels[key]
    # Deterministic fallback: largest area of panel's polygon.
    def area(pa):
        v = pa['vertices']
        return abs(sum(a[0] * b[1] - a[1] * b[0]
                       for a, b in zip(v, v[1:] + v[:1])))
    return max(panels.items(), key=lambda x: area(x[1]))


def ensure_world(scene):
    """Factory-empty Blender scenes have no World datablock; create one safely."""
    if scene.world is None:
        scene.world = bpy.data.worlds.new('GBL World')
    scene.world.color = (0.18, 0.18, 0.18)
    return scene.world


def main():
    if '--' not in sys.argv:
        raise RuntimeError('Syntaxe: blender -b --python blender_drape.py -- <spec.json> <output_dir>')
    args = sys.argv[sys.argv.index('--')+1:]
    if len(args) != 2:
        raise RuntimeError('Il faut le chemin JSON et le répertoire de sortie.')
    source, target = Path(args[0]).resolve(), Path(args[1]).resolve()
    target.mkdir(parents=True, exist_ok=True)
    spec = json.loads(source.read_text(encoding='utf-8'))
    name, panel = choose_panel(spec)
    vertices_2d = panel['vertices']
    if not (3 <= len(vertices_2d) <= 1500):
        raise ValueError('Panneau invalide / trop complexe pour cette démonstration')

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.gravity = (0.0, 0.0, -9.81)
    scene.frame_start = 1
    scene.frame_end = 55
    scene.render.resolution_x = 640
    scene.render.resolution_y = 800
    scene.render.resolution_percentage = 75
    scene.render.image_settings.file_format = 'PNG'

    skin = build_material('Matériau mannequin', (0.61, 0.64, 0.70, 1))
    fabric = build_material('Textile lilas', (0.51, 0.45, 0.75, 1), roughness=0.95)
    make_collision_ellipsoid('Buste · collision', (0, 0.06, 1.11), (.245, .175, .39), skin)
    make_collision_ellipsoid('Bassin · collision', (0, 0.06, 0.78), (.24, .16, .22), skin)
    make_collision_ellipsoid('Tête · repère', (0, 0.06, 1.73), (.11, .11, .15), skin)
    make_collision_ellipsoid('Cou · repère', (0, 0.06, 1.52), (.067, .066, .105), skin)

    # Convert input garment drafting coordinates (typically cm) into a vertical panel.
    # The panel is placed *in front* of the torso (negative Y), in meters.
    xy = [Vector((float(x)/100.0, float(y)/100.0, 0.0)) for x, y in vertices_2d]
    faces = tessellate_polygon([xy])
    if not faces:
        raise ValueError('Polygone non triangulable. Vérifier le contour du panneau.')
    verts = [(p.x, -0.24, 1.52+p.y) for p in xy]
    # Blender versions differ: tessellate_polygon() can yield triangles with
    # integer indices (Blender 5.2), or mathutils.Vector vertices (older APIs).
    # Respect integer indices directly: subtracting an int from Vector crashes.
    def point_index(p):
        if isinstance(p, numbers.Integral):
            i = int(p)
            if not (0 <= i < len(xy)):
                raise ValueError(f"Indice de triangle hors limites: {i}")
            return i
        if hasattr(p, 'x') and hasattr(p, 'y'):
            # Fallback for versions returning Vector objects.
            return min(range(len(xy)),
                       key=lambda i: (xy[i] - p).length_squared)
        raise TypeError(f"Type de sommet inattendu: {type(p).__name__}")

    triangles = [tuple(point_index(p) for p in tri) for tri in faces]
    # Prevent degenerate faces from entering the cloth solver.
    triangles = [tri for tri in triangles if len(set(tri)) == 3]
    if len(verts) < 3 or not triangles:
        raise ValueError('Aucune face générée pour le tissu.')
    mesh = bpy.data.meshes.new('maillage_textile')
    mesh.from_pydata(verts, [], triangles)
    mesh.update()
    cloth = bpy.data.objects.new('Panneau simulé · '+name, mesh)
    bpy.context.collection.objects.link(cloth)
    cloth.data.materials.append(fabric)

    # Tessellate further for actual deformation.
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=6, use_grid_fill=True)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    top = max(v.co.z for v in mesh.vertices)
    pinned = [v.index for v in mesh.vertices if v.co.z >= top - .035]
    if len(pinned) < 2:
        pinned = sorted((v.index for v in mesh.vertices),
                        key=lambda i: mesh.vertices[i].co.z, reverse=True)[:2]
    grp = cloth.vertex_groups.new(name='Haut maintenu')
    grp.add(pinned, 1.0, 'REPLACE')
    modifier = cloth.modifiers.new('Tissu physique', 'CLOTH')
    modifier.settings.quality = 7
    modifier.settings.mass = 0.32
    modifier.settings.vertex_group_mass = grp.name
    modifier.collision_settings.use_collision = True
    modifier.collision_settings.distance_min = 0.006

    # Camera setup in front of the model (negative Y).
    bpy.ops.object.camera_add(location=(1.0, -2.9, 1.5))
    camera = bpy.context.object
    direction = Vector((0, 0, 1.19))-camera.location
    camera.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 1.75
    scene.camera = camera
    bpy.ops.object.light_add(type='AREA', location=(-1.3, -1.8, 2.7))
    bpy.context.object.data.energy = 600
    bpy.context.object.data.shape = 'DISK'
    bpy.context.object.data.size = 2.2
    ensure_world(scene)
    try:
        scene.render.engine = 'BLENDER_WORKBENCH'
        scene.display.shading.color_type = 'MATERIAL'
    except Exception:
        pass

    for frame in range(1, scene.frame_end+1):
        scene.frame_set(frame)
        if frame % 10 == 0:
            print('Simulation frame', frame, flush=True)

    # Blender evaluated mesh contains the cloth modifier output at current frame.
    dg = bpy.context.evaluated_depsgraph_get()
    obj_eval = cloth.evaluated_get(dg)
    evaluated = obj_eval.to_mesh(preserve_all_data_layers=True, depsgraph=dg)
    if evaluated is None:
        raise RuntimeError('Le maillage évalué de tissu est indisponible.')
    obj_path = target/'tissu_drape.obj'
    with obj_path.open('w', encoding='utf-8') as stream:
        stream.write('# Drape sample : single, pinned pattern panel, not fully sewn garment\n')
        for vertex in evaluated.vertices:
            v = obj_eval.matrix_world @ vertex.co
            stream.write(f'v {v.x:.6f} {v.y:.6f} {v.z:.6f}\n')
        for polygon in evaluated.polygons:
            stream.write('f ' + ' '.join(str(i+1) for i in polygon.vertices) + '\n')
    point_count = len(evaluated.vertices)
    face_count = len(evaluated.polygons)
    obj_eval.to_mesh_clear()

    # Leave the modifier and the avatar inside the .blend file for inspection.
    blend_path = target/'atelier_drape.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    report = {
        'success': True, 'selected_panel': name, 'frames': scene.frame_end,
        'cloth_points': point_count, 'cloth_faces': face_count,
        'files': ['tissu_drape.obj', 'atelier_drape.blend'],
        'limits': 'Panneau unique épinglé; le patron entier n’est PAS assemblé. '
                  'Aucun raccord de couture garanti. Pas de validation de confection.'
    }
    (target/'rapport.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print('GBL_BLENDER_SIM_COMPLETE', json.dumps(report, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
