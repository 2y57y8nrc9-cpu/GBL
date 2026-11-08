from pathlib import Path
import numpy as np
import trimesh
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
from benchmark_geometrique import procedural_avatar_points
root=Path(__file__).resolve().parent
out=root/'validation_geometrie'
body=np.array(procedural_avatar_points())
fig=plt.figure(figsize=(15,6.4),facecolor='white')
scenes=[('legacy_pose','Pose ancienne'),('synthetic_body_guided','Placement anatomique'),('lbfgs_guided_4000','Pré-ajustement élastique')]
for k,(variant,title) in enumerate(scenes,1):
 ax=fig.add_subplot(1,3,k,projection='3d',computed_zorder=False)
 m=trimesh.load(str(out/f'preassemblage_{variant}.obj' if not variant.startswith('lbfgs') else out/f'{variant}.obj'),process=False)
 xyz=np.array(m.vertices);tris=np.array(m.faces)
 ax.scatter(body[::13,0],body[::13,1],body[::13,2],s=.45,c='#7f8793',alpha=.24,depthshade=False)
 pc=Poly3DCollection(xyz[tris],alpha=.75,facecolors='#acd5db',edgecolors='none',zorder=4)
 ax.add_collection3d(pc)
 ax.set(xlim=(-.80,.80),ylim=(-.65,.65),zlim=(.4,1.9),xlabel='X',ylabel='Y',zlabel='Z',title=title)
 ax.set_box_aspect((1.6,1.3,1.5));ax.view_init(elev=9,azim=-67)
fig.suptitle('GBL : pré-placement géométrique sur corps SYNTHÉTIQUE (ni Blender Cloth ni MPFB)',fontsize=13)
fig.tight_layout()
fig.savefig(str(out/'comparaison_geometrie.png'),dpi=155)
print(out/'comparaison_geometrie.png')
