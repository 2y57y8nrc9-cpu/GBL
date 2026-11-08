"""Garment Bending Lab V2: local-first Python API + frontend.

Run: python server.py. Do not expose on public networks without authentication.
"""
from pathlib import Path
import json
from fastapi import FastAPI, HTTPException, Body, UploadFile, File
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from garmentlab.geometry import validate,sample_shape
from garmentlab.fitting import fit_reference
from garmentlab.mutations import mutate
from garmentlab.native import settings,launch,get_job
from garmentlab.mac_native import status as mac_status, launch_blender, get_job as mac_get_job
from garmentlab.v3_photo import interpret,ollama_status
from garmentlab.v3_build import construct,fidelity_mutate
from garmentlab.v3_avatar import store_obj,valid_avatar
from garmentlab import mpfb_auto, paired_learning
from garmentlab.v3_quality import acceptance

ROOT=Path(__file__).resolve().parent
app=FastAPI(title='Garment Bending Lab V3.7',version='3.7.0',docs_url='/api/docs')
AVATARS=ROOT/'runs'/'avatars'
app.mount('/v3', StaticFiles(directory=ROOT/'frontend_v3'),name='v3')
app.mount('/static', StaticFiles(directory=ROOT/'frontend'),name='static')
app.mount('/patrons_json', StaticFiles(directory=ROOT/'patrons_json'),name='examples')
app.mount('/legacy', StaticFiles(directory=ROOT/'legacy',html=True),name='legacy')

@app.get('/')
def home():return FileResponse(ROOT/'frontend_v3'/'index.html')

@app.get('/classic')
def classic():return FileResponse(ROOT/'frontend'/'index.html')

@app.get('/api/v3/status')
def v3_status():return {'version':'3.7.0','vision':ollama_status(),'simulation':mac_status(),'mpfb':mpfb_auto.status(),
 'note':'Photo → hypothèse de patron pour hauts simples. La simulation Blender est expérimentale.'}

@app.post('/api/v3/photo')
def v3_photo(payload:dict=Body(...)):
    try:return interpret(payload.get('image',''),payload.get('model','qwen2.5vl:3b'))
    except (ValueError,RuntimeError) as e:raise HTTPException(422,str(e))

@app.post('/api/v3/construct')
def v3_construct(payload:dict=Body(...)):
    try:return construct(payload.get('analysis',{}),payload.get('measurements',{}))
    except ValueError as e:raise HTTPException(422,str(e))

@app.post('/api/v3/mutate')
def v3_mutation(payload:dict=Body(...)):
    try:return fidelity_mutate(payload['specification'],payload.get('intensity',25),payload.get('seed',2841),payload.get('operators',['contour']),payload.get('preserve',.85),payload.get('mode','stable'))
    except (ValueError,KeyError) as e:raise HTTPException(422,str(e))

@app.post('/api/v3/pairs/analyze')
def paired_analyze(payload:dict=Body(...)):
    try:
        return paired_learning.analyze_pair(payload.get('before_image'),payload.get('after_image'),payload.get('model','qwen2.5vl:3b'))
    except ValueError as e:raise HTTPException(422,str(e))
    except RuntimeError as e:raise HTTPException(503,str(e))

@app.post('/api/v3/pairs')
def paired_save(payload:dict=Body(...)):
    try:return paired_learning.save_pair(payload)
    except ValueError as e:raise HTTPException(422,str(e))

@app.get('/api/v3/pairs')
def paired_list():
    records=paired_learning.list_pairs()
    return {'pairs':records,'count':len(records),'trained_weights':False,
            'local_only':True,'note':'Exemples annotés par des humains ; pas de réentraînement du modèle.'}

@app.get('/api/v3/pairs/export')
def paired_export():
    data=paired_learning.export_zip()
    return Response(content=data,media_type='application/zip',
        headers={'Content-Disposition':'attachment; filename="GBL-paires-avant-apres.zip"'})

@app.delete('/api/v3/pairs/{pair_id}')
def paired_delete(pair_id:str):
    if not paired_learning.delete_pair(pair_id):raise HTTPException(404,'Paire introuvable.')
    return {'deleted':True}

@app.get('/api/v3/mpfb/status')
def mpfb_status():
    return mpfb_auto.status()

@app.post('/api/v3/mpfb/generate')
def mpfb_generate(payload:dict=Body(...)):
    try:return mpfb_auto.launch(payload)
    except ValueError as exc:raise HTTPException(422,str(exc))
    except RuntimeError as exc:raise HTTPException(503,str(exc))

@app.get('/api/v3/mpfb/jobs/{job_id}')
def mpfb_job(job_id:str):
    job=mpfb_auto.get_job(job_id)
    if not job:raise HTTPException(404,'Génération d’avatar inconnue.')
    return {k:v for k,v in job.items() if k not in ('workdir',)}

@app.get('/api/v3/mpfb/jobs/{job_id}/file/{name}')
def mpfb_job_file(job_id:str,name:str):
    path=mpfb_auto.get_file(job_id,name)
    if not path:raise HTTPException(404,'Fichier avatar introuvable.')
    media='image/png' if name=='avatar.png' else None
    return FileResponse(path,media_type=media,filename=None if name=='avatar.png' else name)

@app.post('/api/v3/avatar')
async def v3_avatar_upload(file:UploadFile=File(...)):
    if not file.filename.lower().endswith('.obj'):raise HTTPException(422,'Avatar au format OBJ uniquement.')
    try:
        data=await file.read(28_000_001)
        info=store_obj(data,AVATARS)
        return {k:v for k,v in info.items() if k!='path'}
    except ValueError as e:raise HTTPException(422,str(e))

@app.post('/api/v3/simulate')
def v3_simulate(payload:dict=Body(...)):
    try:
        spec=payload['specification'].copy()
        if not payload.get('avatar_id'):
            raise ValueError('Avatar MPFB requis. Cliquer sur « Générer avatar » avant de simuler.')
        avatar=valid_avatar(payload.get('avatar_id'),AVATARS)
        quality=int(payload.get('mesh_levels',2))
        if quality not in (1,2,3):raise ValueError('Maillage de niveau 1 à 3.')
        arrangement_mode=payload.get('placement_mode','body_volumes')
        if arrangement_mode not in ('body_volumes','legacy'):
            raise ValueError('Mode de pré-placement inconnu.')
        assembly_mode=payload.get('assembly_mode','preassembled')
        if assembly_mode not in ('preassembled','springs'):
            raise ValueError('Mode d’assemblage inconnu.')
        spec['gbl_v3_simulation']={'avatar_obj':str(avatar),'mesh_levels':quality,'placement_mode':arrangement_mode,'assembly_mode':assembly_mode}
        return launch_blender(spec,mode='sewn')
    except (ValueError,KeyError) as e:raise HTTPException(422,str(e))
    except RuntimeError as e:raise HTTPException(503,str(e))

@app.post('/api/v3/acceptance')
def v3_acceptance(payload:dict=Body(...)):
    try:return acceptance(payload['specification'],payload.get('report'))
    except (KeyError,ValueError) as e:raise HTTPException(422,str(e))

@app.get('/api/catalog')
def catalog():return json.loads((ROOT/'patrons_json'/'catalog.json').read_text(encoding='utf8'))

@app.get('/api/pattern/{slug}')
def pattern(slug:str):
    catalog=json.loads((ROOT/'patrons_json'/'catalog.json').read_text(encoding='utf8'))
    row=next((x for x in catalog if x['id']==slug),None)
    if not row:raise HTTPException(status_code=404,detail='Patron inconnu')
    return json.loads((ROOT/'patrons_json'/row['file']).read_text(encoding='utf8'))

@app.post('/api/validate')
def check(doc:dict=Body(...)):
    try:
        report=validate(doc)
        return {'diagnostic':report, 'fitting':fit_reference(doc), 'shape':sample_shape(doc) if report['ok'] else []}
    except Exception as e:raise HTTPException(422, str(e))

class MutationBody(BaseModel):
    specification:dict
    intensity:float=Field(45,ge=0,le=100)
    seed:int=2841
    operators:list[str]=['contour','anatomy']
    mode:str='stable'
    equalize:bool=True

@app.post('/api/mutate')
def mutation(body:MutationBody):
    try:
        result=mutate(body.specification,body.intensity,body.seed,body.operators,body.mode,body.equalize)
        result['shape']=sample_shape(result['specification'])
        result['fitting']=fit_reference(result['specification'])
        return result
    except Exception as e:raise HTTPException(422,str(e))

@app.get('/api/native/status')
def native_status():return settings()

@app.post('/api/native/simulate')
def native_sim(doc:dict=Body(...)):
    try:return launch(doc)
    except ValueError as e:raise HTTPException(422,str(e))
    except RuntimeError as e:raise HTTPException(503,str(e))

@app.get('/api/native/jobs/{job_id}')
def native_job(job_id:str):
    j=get_job(job_id)
    if not j:raise HTTPException(404,'Job inconnu')
    return j

@app.get('/api/native/jobs/{job_id}/model/{index}')
def native_model(job_id:str,index:int):
    j=get_job(job_id)
    if not j:raise HTTPException(404,'Job inconnu')
    outputs=j.get('output_paths',[])
    if index<0 or index>=len(outputs):raise HTTPException(404,'Maillage inconnu')
    p=Path(outputs[index])
    if not p.is_file():raise HTTPException(404,'Maillage inaccessible')
    return FileResponse(p,media_type='text/plain',filename=p.name)

@app.get('/api/native/jobs/{job_id}/log')
def native_log(job_id:str):
    j=get_job(job_id)
    if not j:raise HTTPException(404,'Job inconnu')
    p=Path(j['workdir'])/'simulation.log'
    if not p.exists():raise HTTPException(404,'Log pas encore disponible')
    return FileResponse(p,media_type='text/plain')


@app.get('/api/mac/status')
def mac_sim_status():
    return mac_status()

@app.post('/api/mac/simulate')
def mac_sim(doc: dict=Body(...)):
    try:return launch_blender(doc, mode='panel')
    except ValueError as e:raise HTTPException(422,str(e))
    except RuntimeError as e:raise HTTPException(503,str(e))

@app.post('/api/mac/sewn')
def mac_sewn(doc: dict=Body(...)):
    try:return launch_blender(doc, mode='sewn')
    except ValueError as e:raise HTTPException(422,str(e))
    except RuntimeError as e:raise HTTPException(503,str(e))

@app.get('/api/mac/jobs/{job_id}')
def mac_job(job_id:str):
    job=mac_get_job(job_id)
    if not job:raise HTTPException(404,'Job inconnu')
    return job

@app.get('/api/mac/jobs/{job_id}/file/{file_name}')
def mac_file(job_id:str,file_name:str):
    job=mac_get_job(job_id)
    if not job:raise HTTPException(404,'Job inconnu')
    if file_name not in ['tissu_drape.obj','atelier_drape.blend','rapport.json','tshirt_cousu.obj','atelier_tshirt_cousu.blend','rapport_couture.json','tshirt_preview.png','tshirt_preassemblage.obj','blender.log']:
        raise HTTPException(404,'Fichier inconnu')
    p=Path(job['workdir'])/file_name
    if not p.is_file():raise HTTPException(404,'Fichier pas encore disponible')
    return FileResponse(p,filename=file_name)

if __name__=='__main__':
    import uvicorn
    print('Garment Bending Lab V3 : http://127.0.0.1:8765')
    uvicorn.run(app,host='127.0.0.1',port=8765)
