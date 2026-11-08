"""Generate a human automatically with official MPFB service API, Blender 4.2+.

Usage:
  Blender -b --python mpfb_generate_avatar.py -- parameters.json output_dir

The installed MPFB extension is an OPTIONAL EXTERNAL DEPENDENCY, not bundled here.
MPFB scripts use dynamic imports because Blender's extension module location varies.
See https://github.com/makehumancommunity/mpfb2/tree/master/script_samples
"""
import importlib
import json
import math
import os
from pathlib import Path
import sys
import traceback

import bpy
from mathutils import Vector


def discover_mpfb():
    """Enable locally installed MPFB in background Blender and load its services."""
    import addon_utils

    # The user's active Blender addon preferences are shared with background jobs.
    # This only enables installed code; it does not fetch or install software.
    candidates = ['bl_ext.blender_org.mpfb', 'bl_ext.user_default.mpfb', 'mpfb']
    try:
        for mod in addon_utils.modules(refresh=True):
            name = mod.__name__
            if name.endswith('.mpfb') or name == 'mpfb':
                candidates.append(name)
    except Exception:
        pass
    errors = []
    for name in dict.fromkeys(candidates):
        try:
            addon_utils.enable(name, default_set=False, persistent=False)
            importlib.import_module(name)
            if any(s.endswith('mpfb.services.humanservice') for s in sys.modules):
                break
        except Exception as exc:
            errors.append(f'{name}: {type(exc).__name__}: {str(exc)[:140]}')
            continue
    else:
        for error in errors: print('GBL_MPFB_ADDON_ATTEMPT',error,flush=True)
        raise RuntimeError(
            "L'extension MPFB n'est pas disponible ou ne s'active pas dans Blender. "
            "Ouvre Blender → Edit → Preferences → Get Extensions → MPFB → Install, "
            "redémarre Blender, puis réessaie. L'import manuel d'OBJ n'est pas nécessaire."
        )

    def service(path, symbol):
        candidates = [n for n in sys.modules if n.endswith(path)]
        for name in candidates:
            obj = getattr(importlib.import_module(name), symbol, None)
            if obj:
                return obj
        # In some builds the plugin defers service imports until first access.
        base_modules = [n for n in sys.modules if n.endswith('.mpfb') or n == 'mpfb']
        for base in base_modules:
            try:
                obj = getattr(importlib.import_module(base + '.' + path.removeprefix('mpfb.')), symbol)
                return obj
            except (AttributeError, ImportError):
                continue
        raise RuntimeError('API MPFB indisponible : '+path+'. Vérifier la version de MPFB.')

    return service('mpfb.services.humanservice', 'HumanService'), service('mpfb.services.targetservice', 'TargetService')


def export_evaluated_body(body, output_path, desired_height):
    """Write a Blender evaluated body mesh into a self-contained OBJ in metres.

    Avoids version-sensitive bpy.ops.wm.obj_export arguments and external MTL dependencies.
    """
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    evaluated = body.evaluated_get(graph)
    mesh = evaluated.to_mesh(preserve_all_data_layers=False, depsgraph=graph)
    try:
        if len(mesh.vertices) < 100 or len(mesh.polygons) < 100:
            raise RuntimeError('MPFB a créé une géométrie de corps incomplète.')
        coords = [evaluated.matrix_world @ v.co for v in mesh.vertices]
        lo = Vector([min(v[i] for v in coords) for i in range(3)])
        hi = Vector([max(v[i] for v in coords) for i in range(3)])
        height = hi.z - lo.z
        if not 0.3 < height < 5.0:
            raise RuntimeError(f'Hauteur MPFB incohérente ({height:.3f} m).')
        factor = desired_height / height
        center_x = 0.5*(lo.x + hi.x)
        center_y = 0.5*(lo.y + hi.y)
        coords = [((v.x-center_x)*factor, (v.y-center_y)*factor, (v.z-lo.z)*factor) for v in coords]
        with output_path.open('w', encoding='utf-8') as f:
            f.write('# Garment Bending Lab / avatar MPFB procédural, hauteur normalisée (m)\n')
            f.write('o Body_MakeHuman_Mpfb\n')
            for x,y,z in coords:
                f.write(f'v {x:.7f} {y:.7f} {z:.7f}\n')
            for poly in mesh.polygons:
                f.write('f ' + ' '.join(str(i + 1) for i in poly.vertices) + '\n')
        vertices=len(mesh.vertices)
        faces=len(mesh.polygons)
        return {'vertices':vertices,'faces':faces,'height_m':desired_height,
                'body_bounds_m':{
                    'x':[round(min(v[0] for v in coords),4),round(max(v[0] for v in coords),4)],
                    'y':[round(min(v[1] for v in coords),4),round(max(v[1] for v in coords),4)],
                    'z':[0., round(desired_height,4)]},
                'estimated_body_measurements':False,
                'note':'Morphologie MPFB paramétrique. Tour de poitrine, taille et bassin non calibrés.'}
    finally:
        evaluated.to_mesh_clear()


def render_preview(body, folder):
    scene=bpy.context.scene
    if scene.world is None:
        scene.world=bpy.data.worlds.new('GBL MPFB World')
    scene.world.color=(.12,.13,.16)
    skin=bpy.data.materials.new('GBL neutral skin · preview only')
    skin.diffuse_color=(.60,.49,.43,1)
    body.data.materials.clear()
    body.data.materials.append(skin)
    for face in body.data.polygons:
        face.use_smooth=True
    # Nice neutral orthographic reference camera, no external textures needed.
    bpy.ops.object.camera_add(location=(2.5,-3.8,1.5))
    camera=bpy.context.object
    aim=Vector((0.,0.,.92))
    camera.rotation_euler=(aim-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type='ORTHO'
    camera.data.ortho_scale=2.45
    scene.camera=camera
    bpy.ops.object.light_add(type='AREA',location=(-2,-2,3.0))
    bpy.context.object.data.energy=850
    bpy.context.object.data.size=3
    try:
        scene.render.engine='BLENDER_WORKBENCH'
        scene.display.shading.color_type='MATERIAL'
        scene.display.shading.light='STUDIO'
        scene.display.shading.show_shadows=True
        scene.render.film_transparent=False
        scene.render.image_settings.file_format='PNG'
        scene.render.resolution_x=650
        scene.render.resolution_y=800
        scene.render.resolution_percentage=100
        scene.render.filepath=str(folder/'avatar.png')
        bpy.ops.render.render(write_still=True)
    except Exception as exc:
        print('GBL_MPFB_PREVIEW_WARNING',str(exc),flush=True)
    # Save editable body with MPFB modifiers/shape keys for Blender research.
    bpy.ops.wm.save_as_mainfile(filepath=str(folder/'avatar.blend'))


def main():
    if '--' not in sys.argv:
        raise RuntimeError('Argument JSON manquant.')
    args=sys.argv[sys.argv.index('--')+1:]
    if len(args)!=2:
        raise RuntimeError('Deux arguments requis (params.json, outputdir).')
    params=json.loads(Path(args[0]).read_text(encoding='utf-8'))
    folder=Path(args[1]).resolve()
    folder.mkdir(parents=True,exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    HumanService, TargetService=discover_mpfb()
    macro=TargetService.get_default_macro_info_dict()
    macro['gender']=float(params['morphology'])
    macro['weight']=float(params['body_shape'])
    macro['muscle']=float(params['muscle'])
    macro['proportions']=float(params['proportions'])
    macro['age']=float(params['age_shape'])
    # Height is calibrated in metres on OBJ export; preserve MPFB default height
    # during morph blending to avoid scaling a shape twice.
    macro['height']=.5
    print('GBL_MPFB_MACROS',json.dumps({k:v for k,v in macro.items() if k!='race'}),flush=True)
    body=HumanService.create_human(macro_detail_dict=macro,mask_helpers=True,feet_on_ground=True)
    body.name='GBL MPFB · Human body'
    info=export_evaluated_body(body,folder/'avatar.obj',float(params['height_cm'])/100.0)
    info['mpfb_api']='HumanService.create_human(macro_detail_dict=...)'
    info['morphology']=params
    (folder/'avatar_metrics.json').write_text(json.dumps(info,ensure_ascii=False,indent=2),encoding='utf-8')
    render_preview(body,folder)
    print('GBL_MPFB_GENERATION_COMPLETE',json.dumps(info,ensure_ascii=False),flush=True)


if __name__=='__main__':
    try:
        main()
    except Exception as e:
        print('GBL_MPFB_ERROR:',str(e),flush=True)
        traceback.print_exc()
        sys.exit(1)
