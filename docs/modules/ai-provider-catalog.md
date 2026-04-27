# AI Provider Catalog

This catalog keeps model choice layered instead of dumping every model into the product UI.

## Runtime Contract

- Text providers call `GenerateTextWithProvider`.
- Image providers call `GenerateImageWithProvider`.
- Video providers continue to use the existing video task path (`createVideoTask`, Seedance/UpToken, jobs, billing).
- API keys stay encrypted in `ai_providers`; frontend never receives keys.

## Admin Presets

Admin `AI providers` now offers presets so an operator chooses a provider/model and only fills the key:

- OpenAI: GPT text and GPT Image slots
- Anthropic: Claude via native Messages API
- Google: Gemini text and Nano Banana image slot through the OpenAI-compatible base URL where supported
- BytePlus: Seed, Seedream, Seedance, OmniHuman catalog slots
- DeepSeek, Qwen/DashScope, GLM/Zhipu, Kimi/Moonshot, MiniMax
- FLUX, Kling placeholders for future native adapters

## Product Routing

- Director script/storyboard generation should prefer `text` providers with `script` or `storyboard` capability.
- Shot reference generation should prefer `image` providers.
- Canvas video nodes should only show `video` providers/models.
- Digital-human models stay out of normal video pickers until an avatar workflow exists.

## Caveat

OpenAI-compatible text providers are wired today. Anthropic text is wired through native Messages API. Vendor-native image/video APIs that do not expose an OpenAI-compatible `/images/generations` or the existing video task contract must get a dedicated adapter before being marked live.
