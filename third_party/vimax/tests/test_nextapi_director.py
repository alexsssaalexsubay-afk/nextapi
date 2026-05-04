"""Tests for the NextAPI-facing Director Engine adapter."""

import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from nextapi_director import build_nextapi_director_plan


class TestNextAPIDirectorPlan(unittest.TestCase):
    def test_builds_seedance_content_and_comfyui_workflow(self):
        plan = build_nextapi_director_plan(
            "A founder discovers a glowing prototype in a rainy city.\n\nShe records a tense launch teaser.",
            shot_count=2,
            duration=5,
            character_refs="asset://ut-asset-hero",
        )

        self.assertEqual(plan["schema"], "nextapi.director_plan.v1")
        self.assertEqual(len(plan["shots"]), 2)
        self.assertEqual(plan["shots"][0]["content"][0]["type"], "text")
        self.assertEqual(plan["shots"][0]["content"][1]["image_url"]["url"], "asset://ut-asset-hero")
        self.assertEqual(plan["workbench"]["schema"], "nextapi.director_workbench.v1")
        self.assertIn("composition", plan["shots"][0])
        self.assertIn("timeline", plan["shots"][0])
        self.assertEqual(plan["workflow"]["nodes"][2]["type"], "NextAPIGenerateVideo")
        self.assertEqual(plan["workflow"]["nodes"][2]["params"]["shot_id"], plan["shots"][0]["id"])
        self.assertIn("storyboard_artist.design_storyboard", plan["agent_chain"])
        self.assertIn("cinematography_shot_agent.refine_shot", plan["agent_chain"])

    def test_rejects_empty_script(self):
        with self.assertRaises(ValueError):
            build_nextapi_director_plan("   ")


if __name__ == "__main__":
    unittest.main()
