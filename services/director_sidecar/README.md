# NextAPI Director Runtime

This sidecar runs the vendored director/storyboard pipeline as an internal planning runtime.

Key guarantees:

- The sidecar never receives model API keys.
- Text calls go back to the Go backend through `DIRECTOR_RUNTIME_CALLBACK_URL`.
- Video generation is not executed here; generated shots are converted to the existing workflow/task system.
- The public product name stays `NextAPI Director`.

Local run:

```bash
python3 -m venv .venv-director
. .venv-director/bin/activate
pip install -r services/director_sidecar/requirements.txt
export NEXTAPI_REPO_ROOT="$PWD"
export DIRECTOR_RUNTIME_TOKEN="dev-runtime-token"
export DIRECTOR_RUNTIME_CALLBACK_URL="http://127.0.0.1:8080/v1/internal/director-runtime"
uvicorn services.director_sidecar.app:app --host 127.0.0.1 --port 8091
```

Backend env:

```bash
export VIMAX_RUNTIME_URL="http://127.0.0.1:8091"
export DIRECTOR_RUNTIME_TOKEN="dev-runtime-token"
export DIRECTOR_RUNTIME_CALLBACK_URL="http://127.0.0.1:8080/v1/internal/director-runtime"
```
