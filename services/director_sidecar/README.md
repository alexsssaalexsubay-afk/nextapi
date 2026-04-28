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

Offline pipeline smoke:

```bash
python -m services.director_sidecar.smoke
```

This starts a fake internal text-provider callback and verifies that the vendored screenwriter, character extractor, and storyboard artist execute without any external model keys.

Backend env:

```bash
export VIMAX_RUNTIME_URL="http://127.0.0.1:8091"
export DIRECTOR_RUNTIME_TOKEN="dev-runtime-token"
export DIRECTOR_SIDECAR_TOKEN="dev-sidecar-token"
export DIRECTOR_RUNTIME_CALLBACK_URL="http://127.0.0.1:8080/v1/internal/director-runtime"
```

Production:

- `docker-compose.prod.yml` runs `director-sidecar` from `services/director_sidecar/Dockerfile`.
- Backend talks to it through `http://director-sidecar:8091`.
- Sidecar calls back into backend through `http://backend:8080/v1/internal/director-runtime`.
- `/health` loads the vendored director modules before returning healthy, so production will not silently mark the advanced engine ready when the runtime dependencies are missing.
