from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    host: str = "127.0.0.1"
    port: int = 8765
    debug: bool = False

    comfyui_url: str = "ws://localhost:8188"

    ollama_url: str = "http://localhost:11434"

    nextapi_base_url: str = "https://api.nextapi.top"
    nextapi_api_key: str = ""

    openai_api_key: str = ""
    openai_base_url: str = ""
    openai_model: str = "gpt-4o"

    runninghub_base_url: str = "https://www.runninghub.cn"
    runninghub_api_key: str = ""

    local_openai_base_url: str = ""
    local_video_model_dir: str = ""
    local_image_model_dir: str = ""

    custom_http_base_url: str = ""
    custom_http_api_key: str = ""

    project_dir: str = ""

    model_config = {"env_prefix": "NEXTCUT_", "env_file": ".env", "extra": "ignore"}


settings = Settings()
