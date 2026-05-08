import unittest

from app.api.generate import (
    BatchGenerateRequest,
    GenerateRequest,
    _build_params,
    preflight_generation_request,
)


class GeneratePreflightTest(unittest.TestCase):
    def test_blocks_image_workflow_without_image_refs(self):
        result = preflight_generation_request(BatchGenerateRequest(shots=[
            GenerateRequest(
                shot_id="shot_01",
                prompt="A product rotates on a clean studio table while the camera pushes in.",
                workflow="image_to_video",
                duration=5,
                quality="720p",
            )
        ]))

        self.assertEqual(result.status, "blocked")
        self.assertTrue(any(f.code == "missing_image_reference" for f in result.findings))

    def test_blocks_provider_limits_and_local_refs(self):
        result = preflight_generation_request(BatchGenerateRequest(shots=[
            GenerateRequest(
                shot_id="shot_02",
                prompt="Use image 1. A character turns toward the camera in soft morning light.",
                duration=16,
                quality="4k",
                image_urls=["blob:http://localhost/ref"] + [f"https://cdn.test/ref-{i}.jpg" for i in range(9)],
            )
        ]))

        codes = {finding.code for finding in result.findings}
        self.assertEqual(result.status, "blocked")
        self.assertIn("duration_range", codes)
        self.assertIn("resolution_value", codes)
        self.assertIn("too_many_images", codes)
        self.assertIn("local_image_reference", codes)

    def test_allows_valid_reference_contract_and_composes_prompt(self):
        shot = GenerateRequest(
            shot_id="shot_03",
            prompt="A hero examines a compact camera on a sunlit table as the camera slowly pushes in.",
            shot_script="Single action: hero lifts the camera and smiles.",
            reference_instructions=["Use image 1 as the identity and product shape reference."],
            constraints="One subject action, one camera move.",
            image_urls=["https://cdn.test/hero-camera.jpg"],
            duration=5,
            quality="720p",
        )
        result = preflight_generation_request(BatchGenerateRequest(shots=[shot]))
        params = _build_params(shot)

        self.assertEqual(result.status, "allowed")
        self.assertEqual(result.critical, 0)
        self.assertIn("Reference instructions", params.prompt)
        self.assertEqual(params.reference_instructions, shot.reference_instructions)


if __name__ == "__main__":
    unittest.main()
