import unittest
import tempfile
from pathlib import Path

from app.api.config import MODEL_PRESETS
import director_engine.tools.runtime_prompts as runtime_prompts
from director_engine.tools.runtime_prompts import (
    register_prompt,
    reset_prompt,
    resolve_system_prompt,
    update_prompt,
)


class RuntimeConfigTest(unittest.TestCase):
    def test_model_registry_has_mainstream_presets(self):
        self.assertGreaterEqual(len(MODEL_PRESETS), 30)
        models = {preset.model for preset in MODEL_PRESETS}
        self.assertIn("gpt-4o", models)
        self.assertIn("claude-sonnet-4-5", models)
        self.assertIn("gemini-2.5-pro", models)
        self.assertIn("deepseek-chat", models)
        self.assertIn("qwen-plus", models)

    def test_runtime_prompt_override_resolves_default_system_prompt(self):
        prompt_id = "test_screenwriter_override"
        default_prompt = "default system prompt for runtime prompt registry test"
        register_prompt(prompt_id, "Test", "Role", default_prompt)
        update_prompt(prompt_id, "custom system prompt for test")

        self.assertEqual(resolve_system_prompt(default_prompt), "custom system prompt for test")

        reset_prompt(prompt_id)
        self.assertEqual(resolve_system_prompt(default_prompt), default_prompt)

    def test_runtime_prompt_override_persists_to_config_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            previous_path = runtime_prompts._CONFIG_PATH
            previous_overrides = runtime_prompts._OVERRIDES
            try:
                runtime_prompts._CONFIG_PATH = Path(tmp) / "runtime-prompts.json"
                runtime_prompts._OVERRIDES = {}
                prompt_id = "persist_test_prompt"
                register_prompt(prompt_id, "Persist", "Role", "persist default")
                update_prompt(prompt_id, "persist custom")

                self.assertTrue(runtime_prompts._CONFIG_PATH.exists())
                self.assertIn("persist custom", runtime_prompts._CONFIG_PATH.read_text())
            finally:
                runtime_prompts._CONFIG_PATH = previous_path
                runtime_prompts._OVERRIDES = previous_overrides


if __name__ == "__main__":
    unittest.main()
