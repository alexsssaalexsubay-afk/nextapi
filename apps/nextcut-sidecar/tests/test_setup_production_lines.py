from app.api.setup import ApiKeyStatus, ComfyUIInfo, LocalRuntimeStatus, OllamaInfo, SetupStatus, _build_production_lines
from app.core.config import settings


def test_production_lines_expose_billing_and_key_source():
    status = SetupStatus(
        runtime=LocalRuntimeStatus(ffmpeg=True, exports_writable=True),
        ollama=OllamaInfo(available=True, recommended_model="qwen2.5:7b"),
        comfyui=ComfyUIInfo(available=True, url="ws://localhost:8188"),
        api_keys=ApiKeyStatus(nextapi=True, openai=True),
    )

    lines = _build_production_lines(status)
    by_id = {line.id: line for line in lines}

    assert by_id["nextapi-video"].ready is True
    assert by_id["nextapi-video"].billing == "team_credits"
    assert by_id["nextapi-video"].key_source == "NextAPI team dashboard key"

    assert by_id["comfyui-image"].ready is True
    assert by_id["comfyui-image"].billing == "local_or_user_key"
    assert "character_assets" in by_id["comfyui-image"].modalities

    assert by_id["local-openai-compatible"].ready is True
    assert "agent_planning" in by_id["local-openai-compatible"].modalities


def test_production_lines_report_missing_model_pack():
    status = SetupStatus(
        runtime=LocalRuntimeStatus(ffmpeg=True, exports_writable=True),
        api_keys=ApiKeyStatus(nextapi=False),
    )

    lines = {line.id: line for line in _build_production_lines(status)}

    assert lines["nextapi-video"].ready is False
    assert "missing_nextapi_key" in lines["nextapi-video"].blockers
    assert lines["local-video-model"].ready is False
    assert "local_video_model_pack_missing" in lines["local-video-model"].blockers


def test_local_openai_line_requires_explicit_configuration(monkeypatch):
    monkeypatch.setattr(settings, "local_openai_base_url", "")
    monkeypatch.delenv("NEXTCUT_LOCAL_OPENAI_BASE_URL", raising=False)

    status = SetupStatus(runtime=LocalRuntimeStatus(ffmpeg=True, exports_writable=True))
    line = {line.id: line for line in _build_production_lines(status)}["local-openai-compatible"]

    assert line.ready is False
    assert "missing_llm_source" in line.blockers


def test_runninghub_endpoint_is_host_root(monkeypatch):
    monkeypatch.setattr(settings, "runninghub_base_url", "https://www.runninghub.cn")
    status = SetupStatus(api_keys=ApiKeyStatus())
    line = {line.id: line for line in _build_production_lines(status)}["runninghub-workflow"]

    assert line.endpoint == "https://www.runninghub.cn"
