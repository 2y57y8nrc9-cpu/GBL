"""Technical render of GEOMETRY ONLY on a synthetic torso, not a cloth simulation."""
import numpy as np, trimesh, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
from pathlib import Path
from offline_elastic_relaxation import build_state
from garmentlab.auto_fit import search_pre_fit
from test_auto_fit_synthetic import callback

ROOT=Path(__file__).resolve().parent
OUT=ROOT/'validation_dynamique';OUT.mkdir(exist_ok=True)
body=trimesh.load(str(OUT/'synthetic_body.obj'),force='mesh')
raw,faces,edges,pins=build_state('guided')
results=search_pre_fit(raw,edges,pins,callback,iterations=145)
optim=np.asarray(results['vertices'],float)
trimesh.Trimesh(vertices=optim,faces=faces,process=False).export(OUT/'preajustement_optimise_SYNTHETIQUE.obj')


def view(xyz,stem):
 fig=plt.figure(figsize=(9,9),facecolor='#f5f4f0');ax=fig.add_subplot(111,projection='3d',computed_zorder=False)
 # Body is a synthetic A-pose torso and arms, not a photoreal human.
 bx=body.vertices[body.faces[::3]]
 col=Poly3DCollection(bx,alpha=.40,linewidths=0,facecolor='#c2b9ae',zorder=1)
 ax.add_collection3d(col)
 tri=xyz[faces]
 cloth=Poly3DCollection(tri,alpha=.88,edgecolor=(.13,.19,.25,.1),linewidths=.16,facecolor='#668da8',zorder=2)
 ax.add_collection3d(cloth)
 ax.set(xlim=(-.55,.55),ylim=(-.42,.42),zlim=(.70,1.59))
 ax.set_box_aspect((1.1,.84,.89),zoom=.9)
 ax.view_init(elev=13,azim=-82)
 ax.set_axis_off()
 ax.text2D(.5,.955,stem,transform=ax.transAxes,ha='center',fontsize=16,fontweight='bold',color='#27343b')
 ax.text2D(.5,.03,'Mannequin SYNTHÉTIQUE / Pose géométrique uniquement / Pas de simulation Blender',transform=ax.transAxes,ha='center',fontsize=9,color='#4d5457')
 fig.savefig(OUT/(stem.replace(' ','_')+'.png'),dpi=160,facecolor=fig.get_facecolor(),bbox_inches='tight')
 plt.close(fig)
view(raw,'Placement initial')
view(optim,'Preajustement optimise')
print('REPORT',results['best'])
