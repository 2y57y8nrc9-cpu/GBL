"""Sanity tests on the extracted pure environment initialization function."""
import ast
from pathlib import Path
from types import SimpleNamespace

src = Path(__file__).parents[1] / 'mac_simulation' / 'blender_drape.py'
tree = ast.parse(src.read_text(encoding='utf-8'))
fn = next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='ensure_world')
namespace = {}
class Worlds:
    def __init__(self): self.created = 0
    def new(self, name):
        self.created += 1
        return SimpleNamespace(name=name, color=None)
worlds = Worlds()
namespace['bpy'] = SimpleNamespace(data=SimpleNamespace(worlds=worlds))
exec(compile(ast.Module(body=[fn],type_ignores=[]), '<extracted>', 'exec'),namespace)
ensure_world = namespace['ensure_world']
scene = SimpleNamespace(world=None)
assert ensure_world(scene) is scene.world
assert scene.world.color == (0.18,0.18,0.18)
assert worlds.created == 1
ensure_world(scene)
assert worlds.created == 1
print('PASS world initialization and re-use')
