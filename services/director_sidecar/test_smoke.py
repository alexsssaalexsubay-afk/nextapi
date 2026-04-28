from __future__ import annotations

import asyncio
import unittest

try:
    import langchain_core  # noqa: F401
except ModuleNotFoundError:  # pragma: no cover - local machines may not have sidecar deps.
    langchain_core = None

from .smoke import _run_smoke


class DirectorSidecarSmokeTest(unittest.TestCase):
    @unittest.skipIf(langchain_core is None, "sidecar runtime dependencies are not installed")
    def test_vendored_pipeline_uses_nextapi_provider_exits(self) -> None:
        result = asyncio.run(_run_smoke())

        self.assertEqual(result["status"], "ok")
        self.assertEqual(result["source"], "vendored_director_pipeline")
        self.assertEqual(result["shot_count"], 2)
        self.assertGreaterEqual(result["provider_callback_calls"], 3)
        self.assertIn("screenwriter.develop_story", result["reusable_modules"])
        self.assertIn("storyboard_artist.design_storyboard", result["reusable_modules"])
        self.assertIn("chat_model.ainvoke -> NextAPI textProvider", result["replaced_model_exits"])


if __name__ == "__main__":
    unittest.main()
