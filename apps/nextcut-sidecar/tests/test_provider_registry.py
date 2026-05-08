import unittest

from app.api.generate import (
    BatchGenerateRequest,
    GenerateRequest,
    _build_provider_config,
    preflight_generation_request,
)
from director_engine.interfaces.models import ProviderConfig
from director_engine.providers.comfyui import ComfyUIProvider
from director_engine.providers.http_adapters import (
    CustomHttpProvider,
    LocalOpenAICompatibleProvider,
    RunningHubProvider,
)
from director_engine.providers.registry import create_video_provider, normalize_provider_name
from director_engine.providers.seedance import SeedanceProvider


class ProviderRegistryTest(unittest.TestCase):
    def test_provider_aliases_create_expected_adapters(self):
        cases = {
            "seedance": SeedanceProvider,
            "nextapi": SeedanceProvider,
            "comfyui": ComfyUIProvider,
            "runninghub": RunningHubProvider,
            "local-openai-compatible": LocalOpenAICompatibleProvider,
            "ollama": LocalOpenAICompatibleProvider,
            "custom-http": CustomHttpProvider,
            "unknown-provider": CustomHttpProvider,
        }

        for provider, expected in cases.items():
            with self.subTest(provider=provider):
                instance = create_video_provider(
                    ProviderConfig(provider=provider, base_url="http://localhost:9999")
                )
                self.assertIsInstance(instance, expected)

    def test_custom_provider_does_not_inherit_nextapi_key_or_seedance_model(self):
        config = _build_provider_config(
            GenerateRequest(
                shot_id="custom_01",
                provider="custom-http",
                prompt="A local workflow renders a storyboard frame.",
                base_url="http://localhost:9000",
            )
        )

        self.assertEqual(config.provider, "custom-http")
        self.assertEqual(config.api_key, "")
        self.assertEqual(config.model, "")

    def test_non_seedance_provider_does_not_apply_seedance_limits(self):
        result = preflight_generation_request(
            BatchGenerateRequest(
                shots=[
                    GenerateRequest(
                        shot_id="custom_02",
                        provider="custom-http",
                        prompt=(
                            "A local workflow renders a long animatic "
                            "with many visual references."
                        ),
                        duration=60,
                        quality="4k",
                        image_urls=[f"https://cdn.test/ref-{i}.png" for i in range(12)],
                    )
                ]
            )
        )

        codes = {finding.code for finding in result.findings}
        self.assertNotIn("duration_range", codes)
        self.assertNotIn("resolution_value", codes)
        self.assertNotIn("too_many_images", codes)

    def test_normalizes_aliases(self):
        self.assertEqual(normalize_provider_name("lm-studio"), "local-openai-compatible")
        self.assertEqual(normalize_provider_name("running-hub"), "runninghub")


if __name__ == "__main__":
    unittest.main()
