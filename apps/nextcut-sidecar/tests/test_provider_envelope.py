import unittest

from app.api.generate import (
    GenerateRequest,
    _build_params,
    _extract_provider_artifacts,
    _sanitize_upstream_payload,
)
from director_engine.providers.seedance import _safe_provider_options


class ProviderEnvelopeTest(unittest.TestCase):
    def test_provider_options_flow_into_generation_params(self):
        req = GenerateRequest(
            shot_id="shot_provider_options",
            prompt="A camera glides past a product hero shot in clean studio light.",
            provider="local-comfy",
            provider_options={
                "workflow_id": "wf-storyboard-v2",
                "sampler": "dpmpp_2m",
                "seed": 42,
                "api_key": "should-not-be-forwarded-by-adapters",
            },
        )

        params = _build_params(req)

        self.assertEqual(params.provider_options["workflow_id"], "wf-storyboard-v2")
        self.assertEqual(params.provider_options["seed"], 42)

    def test_seedance_adapter_filters_provider_option_secrets(self):
        safe = _safe_provider_options(
            {
                "seed": 42,
                "x-api-key": "secret",
                "Authorization": "Bearer secret",
                "access_token": "secret",
            }
        )

        self.assertEqual(safe, {"seed": 42})

    def test_sanitizes_nested_upstream_payloads(self):
        payload = {
            "id": "job_123",
            "api_key": "sk-real",
            "nested": {
                "Authorization": "Bearer secret",
                "access_token": "token-real",
                "safe": "visible",
            },
        }

        sanitized = _sanitize_upstream_payload(payload)

        self.assertEqual(sanitized["api_key"], "[redacted]")
        self.assertEqual(sanitized["nested"]["Authorization"], "[redacted]")
        self.assertEqual(sanitized["nested"]["access_token"], "[redacted]")
        self.assertEqual(sanitized["nested"]["safe"], "visible")

    def test_extracts_artifacts_from_provider_native_shapes(self):
        payload = {
            "output": {
                "video_url": "https://cdn.test/render?id=abc",
                "images": [
                    {"url": "https://cdn.test/storyboard.png", "type": "image", "score": 0.92},
                    "https://cdn.test/last-frame.webp",
                ],
            },
            "audio_url": "https://cdn.test/dialogue.wav",
            "debug": '{"thumbnail_url":"https://cdn.test/thumb.jpg"}',
        }

        artifacts = _extract_provider_artifacts(payload)
        by_url = {artifact["url"]: artifact for artifact in artifacts}

        self.assertEqual(by_url["https://cdn.test/render?id=abc"]["type"], "video")
        self.assertEqual(by_url["https://cdn.test/storyboard.png"]["type"], "image")
        self.assertEqual(by_url["https://cdn.test/last-frame.webp"]["type"], "image")
        self.assertEqual(by_url["https://cdn.test/dialogue.wav"]["type"], "audio")
        self.assertEqual(by_url["https://cdn.test/thumb.jpg"]["type"], "image")


if __name__ == "__main__":
    unittest.main()
