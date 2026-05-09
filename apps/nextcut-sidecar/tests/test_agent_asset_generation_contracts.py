import unittest

from app.api.agents import (
    CharacterAssetRequest,
    StoryboardAssetRequest,
    _character_asset_prompt,
    _image_size_for_ratio,
    _storyboard_asset_prompt,
)
from director_engine.interfaces.models import Character
from director_engine.tools.identity_anchor import IdentityManager


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

    def test_character_asset_prompts_cover_identity_pack_modes(self):
        req = CharacterAssetRequest(
            character_id="char_01",
            name="Maya",
            appearance="short black hair, silver jacket, athletic build",
        )

        self.assertIn("front view", _character_asset_prompt(req, "turnaround"))
        self.assertIn("back view", _character_asset_prompt(req, "turnaround"))
        self.assertIn("neutral, smile", _character_asset_prompt(req, "expressions"))
        self.assertIn("outfit variations", _character_asset_prompt(req, "outfits"))
        self.assertIn("action poses", _character_asset_prompt(req, "poses"))

    def test_identity_manager_injects_full_asset_pack_without_master_duplicate(self):
        manager = IdentityManager()
        character = Character(
            name="Maya",
            appearance="short black hair, silver jacket",
            personality="calm",
            voice="clear",
            reference_images=[f"https://cdn.example.com/maya_{i}.png" for i in range(10)],
        )

        manager.register_character(character)
        refs = manager.get_references_for_shot(["Maya"])

        self.assertEqual(refs[0].role, "character_identity:Maya")
        self.assertEqual(refs[0].url, "https://cdn.example.com/maya_0.png")
        self.assertEqual(len(refs), 9)
        self.assertEqual(len({ref.url for ref in refs}), 9)


if __name__ == "__main__":
    unittest.main()
