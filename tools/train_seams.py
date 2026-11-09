#!/usr/bin/env python3
"""Experimental seam-pair recognition training from GarmentCodeData-style specifications.

Accepts a directory of *_specification.json files (from a dataset the user obtained).
Uses only explicit edge-pair stitch labels. Splits at garment/file level to reduce leakage.
Produces a model card and metrics; cannot prove universal PDF understanding.

Usage:
  python tools/train_seams.py /path/to/GarmentCodeData --out learned_seam_model.json
"""
import argparse, json, math, random, sys
from pathlib import Path

try:
    import numpy as np
    from sklearn.model_selection import GroupShuffleSplit
    from sklearn.preprocessing import StandardScaler
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import precision_score, recall_score, f1_score, roc_auc_score, confusion_matrix
except ImportError as exc:
    sys.exit('Install numpy and scikit-learn: pip install numpy scikit-learn. '+str(exc))

FEATURES=['relative_length_difference','relative_chord_difference','curvature_difference','edge_length_log','centroid_distance_3d_scaled','same_panel','both_curved','edge_direction_3d_abs_dot']

def edge_vector(pan, idx, scale):
    edge=pan['edges'][idx];a=np.array(pan['vertices'][edge['endpoints'][0]],dtype=float)*scale;b=np.array(pan['vertices'][edge['endpoints'][1]],dtype=float)*scale
    return a,b,edge

def feature_pair(panels, first, second, scale):
    p1,e1=first;p2,e2=second
    a,b,edge_a=edge_vector(panels[p1],e1,scale);c,d,edge_b=edge_vector(panels[p2],e2,scale)
    l1=np.linalg.norm(b-a);l2=np.linalg.norm(d-c)
    if l1<1e-6 or l2<1e-6:return None
    ca=np.asarray(panels[p1].get('translation',[0,0,0]),dtype=float)*scale
    cb=np.asarray(panels[p2].get('translation',[0,0,0]),dtype=float)*scale
    av=np.array([*(0.5*(a+b)),0])+ca;bv=np.array([*(0.5*(c+d)),0])+cb
    cur1=edge_a.get('curvature',[0,0]);cur2=edge_b.get('curvature',[0,0])
    def curve_mag(k):
        if isinstance(k,list):return abs(float(k[1])) if len(k)>1 else 0.0
        return .3 if k else 0.0
    mag1,mag2=curve_mag(cur1),curve_mag(cur2)
    u1=(b-a)/l1;u2=(d-c)/l2
    return [
        abs(l1-l2)/max(l1,l2),abs(l1-l2)/(l1+l2),abs(mag1-mag2),
        math.log1p(0.5*(l1+l2)),min(10,float(np.linalg.norm(av-bv))/(l1+l2)),
        float(p1==p2),float(mag1>0.02 and mag2>0.02),abs(float(np.dot(u1,u2)))
    ]

def records(specfile, n_neg_per_positive=3):
    try:data=json.loads(specfile.read_text(encoding='utf-8'))
    except Exception:return None
    spec=data.get('pattern',data)
    panels=spec.get('panels',{});stitches=spec.get('stitches',[])
    if not isinstance(panels,dict) or not panels or not stitches:return None
    unit=100.0/max(1,float(data.get('properties',{}).get('units_in_meter',100)))
    edges=[(name,j) for name,p in panels.items() for j in range(len(p.get('edges',[])))]
    if len(edges)<4:return None
    positive=set()
    for st in stitches:
        if len(st)!=2:continue
        try:
            a=(st[0]['panel'],int(st[0]['edge']));b=(st[1]['panel'],int(st[1]['edge']))
            if a in edges and b in edges and a!=b:positive.add(tuple(sorted([a,b])))
        except (KeyError,TypeError,ValueError):continue
    if not positive:return None
    candidates=[tuple(sorted([a,b])) for k,a in enumerate(edges) for b in edges[k+1:] if a[0]!=b[0]]
    negatives=list(set(candidates)-positive)
    random.Random(str(specfile)).shuffle(negatives)
    subset=list(positive)+negatives[:max(8,n_neg_per_positive*len(positive))]
    xs,ys=[],[]
    for pair in subset:
        try:row=feature_pair(panels,pair[0],pair[1],unit)
        except (IndexError,KeyError,TypeError,ValueError):continue
        if row is not None and all(math.isfinite(v) for v in row):xs.append(row);ys.append(int(pair in positive))
    return (xs,ys) if 1 in ys and 0 in ys else None

def train(files,out,seed):
    all_x,all_y,groups=[],[],[]
    for file in files:
        result=records(file)
        if not result:continue
        x,y=result;all_x.extend(x);all_y.extend(y);groups.extend([str(file)]*len(y))
    n_group=len(set(groups))
    if n_group<5:raise ValueError('Évaluation refusée : au moins 5 patrons indépendants sont nécessaires pour séparer entraînement et validation (trouvés : %d).'%n_group)
    x=np.asarray(all_x,dtype=float);y=np.asarray(all_y,dtype=int)
    splitter=GroupShuffleSplit(n_splits=1,test_size=.25,random_state=seed)
    train_idx,test_idx=next(splitter.split(x,y,groups))
    if len(set(y[train_idx]))<2 or len(set(y[test_idx]))<2:raise ValueError('Labels positifs/négatifs insuffisants dans train/test.')
    scaler=StandardScaler().fit(x[train_idx]);model=LogisticRegression(max_iter=1000,class_weight='balanced',random_state=seed).fit(scaler.transform(x[train_idx]),y[train_idx])
    scores=model.predict_proba(scaler.transform(x[test_idx]))[:,1];pred=(scores>=.5).astype(int)
    result={'schema':'gbl.seam-pair-linear.v1','trained_from_files':n_group,'training_pairs':len(train_idx),'validation_pairs':len(test_idx),'seed':seed,
       'features':FEATURES,'normalization':{'mean':scaler.mean_.tolist(),'std':scaler.scale_.tolist()},
       'coefficients':model.coef_[0].tolist(),'intercept':float(model.intercept_[0]),
       'validation':{'precision':float(precision_score(y[test_idx],pred,zero_division=0)),
                     'recall':float(recall_score(y[test_idx],pred,zero_division=0)),
                     'f1':float(f1_score(y[test_idx],pred,zero_division=0)),
                     'auc':float(roc_auc_score(y[test_idx],scores)),
                     'confusion_matrix':confusion_matrix(y[test_idx],pred,labels=[0,1]).tolist()},
       'disclaimer':'Edge-pair ranking only. Does not infer reliable assembly for arbitrary PDF. Must validate on out-of-domain real patterns. No model bundled by default.'}
    out.write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding='utf-8')
    return result

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('folder',type=Path);ap.add_argument('--out',type=Path,default=Path('learned_seam_model.json'));ap.add_argument('--seed',type=int,default=42);args=ap.parse_args()
    if not args.folder.exists():sys.exit('Dossier introuvable: '+str(args.folder))
    files=list(args.folder.rglob('*_specification.json'))
    if len(files)>2500:print('Limite démonstration : 2 500 patrons pour cette exécution.',file=sys.stderr);files=files[:2500]
    try:
        model=train(files,args.out,args.seed);print(json.dumps({'output':str(args.out),'train_files':model['trained_from_files'],'validation':model['validation']},indent=2))
    except ValueError as e:sys.exit(str(e))
