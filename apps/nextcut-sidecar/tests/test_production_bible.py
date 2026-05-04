import unittest

from director_engine.interfaces.models import (
    Character,
    DirectorScene,
    DirectorShot,
    ReferenceAsset,
    VideoGenerationParams,
)
from director_engine.tools.production_bible import (
    build_production_bible,
    build_shot_generation_card,
    review_generation_prompt,
)


class ProductionBibleTest(unittest.TestCase):
    def test_reference_driven_bible_prefers_assets_over_prompt_bulk(self):
        bible = build_production_bible(
            title="Studio Test",
            style="vertical drama",
            aspect_ratio="9:16",
            duration=5,
            scenes=[
                DirectorScene(
                    id="scene_01",
                    index=1,
                    title="Rooftop",
                    description="A rainy rooftop with neon signs behind the actor.",
                    characters=["Ming"],
                )
            ],
            characters=[
                Character(
                    name="Ming",
                    appearance="short black hair, grey windbreaker, tired eyes",
                    reference_images=["asset://portrait-ming"],
                )
            ],
            references=[ReferenceAsset(url="asset://portrait-ming", type="image", role="character")],
        )

        self.assertIn("Reference-driven", bible.reference_policy)
        self.assertEqual(bible.character_locks[0].name, "Ming")
        self.assertIn("approved portrait", bible.character_locks[0].reference_policy)
        self.assertTrue(any("image 1" in rule for rule in bible.prompt_rules))

    def test_prompt_review_flags_provider_breakers(self):
        shot = DirectorShot(
            id="shot_01",
            scene_id="scene_01",
            index=1,
            title="Bad prompt",
            duration=3,
            prompt="@Image1 hero runs, jumps, grabs, shoots and smiles",
            generation_params=VideoGenerationParams(
                quality="4k",
                image_urls=[f"asset://image-{i}" for i in range(10)],
            ),
        )

        codes = {finding.code for finding in review_generation_prompt(shot)}

        self.assertIn("tag_syntax", codes)
        self.assertIn("duration_range", codes)
        self.assertIn("resolution_value", codes)
        self.assertIn("too_many_images", codes)
        self.assertIn("verb_bloat", codes)

    def test_shot_generation_card_exposes_editable_contracts(self):
        bible = build_production_bible(
            title="Studio Test",
            style="cinematic",
            aspect_ratio="16:9",
            duration=5,
            scenes=[],
            characters=[],
            references=[],
        )
        shot = DirectorShot(
            id="shot_01",
            scene_id="scene_01",
            index=1,
            title="Clean prompt",
            prompt=(
                "Medium close-up. A detective raises a brass lighter in a rain-dark alley. "
                "The camera slowly pushes in as warm flame light reflects across wet brick."
            ),
        )

        card = build_shot_generation_card(shot, bible)

        self.assertEqual(card.shot_id, "shot_01")
        self.assertTrue(card.reference_contract)
        self.assertIn("Generation card", card.prompt_role)


if __name__ == "__main__":
    unittest.main()
