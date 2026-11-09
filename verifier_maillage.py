"""Petit test autonome du correctif V3.0.1, sans Blender ni pytest."""
from garmentlab.sewn_mesh import build_stable_sewn_mesh

panel = ['devant'] * 4 + ['dos'] * 4
v = [(0,0,0),(1,0,0),(1,1,0),(0,1,0),(0,0,1),(1,0,1),(1,1,1),(0,1,1)]
tri = [(0,1,2),(0,2,3),(4,5,6),(4,6,7)]


def project(i, j, uv):
    assert 0 <= i < len(panel) and 0 <= j < len(panel), (i,j)
    assert panel[i] == panel[j], (i,j)
    return (uv[0],uv[1],0.0 if panel[i]=='devant' else 1.0)

result=build_stable_sewn_mesh(
    v, tri, [(0,4),(1,5),(2,6),(3,7)],
    [{'left':[0,1],'right':[4,5]}], [],
    levels=3, chart_uv=[(0,0),(1,0),(1,1),(0,1)]*2,
    surface_map=project,
    vertex_panels=panel)
assert result['stats']['refined_vertices'] > len(v)
print('GBL_V301_MESH_INDEX_OK')
print(result['stats'])
