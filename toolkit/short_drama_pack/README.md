# NextAPI Short Drama Pack

Production-friendly templates for going from "I have an API key" to "I can batch-produce short drama shots with high consistency."

## Contents

- `sample_data/character_bible.csv` — five sample characters with reference-image anchors and fixed visual traits.
- `sample_data/scene_bible.csv` — six reusable locations (cafe, office, rainy street, luxury lobby, park, white studio).
- `sample_data/shot_manifest.csv` — 12 ready-to-run shots covering two drama episodes plus an ecommerce sequence, with `continuity_group` wired correctly.
- `docs/prompt_templates.md` — ten reusable prompt skeletons for entrances, close-ups, emotional pauses, walk-and-turn, cafe / office / rainy / luxury scenes, and ecommerce hero + product detail.
- `docs/workflow_guide.md` — the full operator playbook: the four bibles, the five consistency levers, how to compile a 100-shot manifest, how to retry failed shots.

## Quickstart

```bash
cp -r toolkit/short_drama_pack/sample_data /tmp/my_drama
# edit character_bible.csv / scene_bible.csv / shot_manifest.csv
```

Then run the batch from either:

- **Batch Studio** (recommended for 10+ shots):
  ```bash
  cd toolkit/batch_studio && streamlit run app.py
  ```
  Upload your edited `shot_manifest.csv` in the UI, along with the reference images.
- **ComfyUI** (recommended for 1–10 shots with per-shot tweaking):
  Load `toolkit/comfyui_nextapi/example_workflows/short_drama_consistent_character.json`.

## Recommended reading order

1. `docs/workflow_guide.md` — understand the production flow.
2. `sample_data/shot_manifest.csv` — see a real manifest end-to-end.
3. `docs/prompt_templates.md` — pick templates for your own shots.
4. `sample_data/character_bible.csv` — extend with your cast.

## License

MIT — bundled with the NextAPI customer toolkit.
