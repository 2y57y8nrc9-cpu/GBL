from pathlib import Path
import ast
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "mac_simulation" / "blender_sewn_garment.py"

class Blender52CollisionRegression(unittest.TestCase):
    def test_blender52_collision_settings(self):
        source = SCRIPT.read_text(encoding="utf8")
        ast.parse(source)
        self.assertNotIn("cloth.collision_settings.self_collision_quality", source)
        self.assertIn("cloth.collision_settings.use_self_collision", source)
        self.assertIn("cloth.collision_settings.collision_quality = 8", source)
        self.assertIn("cloth.collision_settings.self_distance_min = .003", source)

if __name__ == "__main__": unittest.main()
