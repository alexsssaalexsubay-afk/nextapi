from __future__ import annotations

import unittest

from .local_client import PromptRefineRequest, refine_prompt


class PromptRefinerTest(unittest.TestCase):
    def test_refine_prompt_adds_director_structure(self) -> None:
        result = refine_prompt(
            PromptRefineRequest(
                prompt="一个女孩夜晚在城市街头慢慢转身",
                style="cinematic realistic",
                ratio="9:16",
                duration=5,
                references=["asset://ut-asset-demo"],
            )
        )

        self.assertIn("Visual style: cinematic realistic", result.refined_prompt)
        self.assertIn("Duration: 5s", result.refined_prompt)
        self.assertIn("approved NextAPI asset", result.structured["reference_policy"])
        self.assertIn("Camera", result.refined_prompt)
        self.assertIn("face deformation", result.negative_prompt)
        self.assertGreaterEqual(len(result.checklist), 5)


if __name__ == "__main__":
    unittest.main()
