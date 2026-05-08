import unittest

from app.api.agents import (
    StoryboardAssetRequest,
    _image_size_for_ratio,
    _storyboard_asset_prompt,
)


class AgentAssetGenerationContractsTest(unittest.TestCase):
    def test_storyboard_image_size_tracks_video_ratio(self):
        self.assertEqual(_image_size_for_ratio("16:9"), "1792x1024")
        self.assertEqual(_image_size_for_ratio("9:16"), "1024x1792")
        self.assertEqual(_image_size_for_ratio("1:1"), "1024x1024")

    def test_storyboard_prompts_separate_first_and_last_frame(self):
        req = StoryboardAssetRequest(
            shot_id="shot_01",
            prompt="A camera glides toward a product on a reflective table.",
            first_frame_desc="Wide opening frame with product centered.",
            last_frame_desc="Close final frame with logo in focus.",
        )

        self.assertIn("FIRST FRAME", _storyboard_asset_prompt(req, "first_frame"))
        self.assertIn("LAST FRAME", _storyboard_asset_prompt(req, "last_frame"))


if __name__ == "__main__":
    unittest.main()
