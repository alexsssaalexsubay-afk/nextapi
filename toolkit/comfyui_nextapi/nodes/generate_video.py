"""NextAPIGenerateVideo — submit a generation job."""

from __future__ import annotations

from ._client import AuthBundle, request_with_retry


class NextAPIGenerateVideo:
    CATEGORY = "NextAPI"
    RETURN_TYPES = ("STRING", "INT", "STRING")
    RETURN_NAMES = ("job_id", "estimated_credits", "status")
    FUNCTION = "submit"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "auth": ("NEXTAPI_AUTH",),
                "prompt": ("STRING", {"default": "", "multiline": True}),
                "duration": ("INT", {"default": 5, "min": 4, "max": 15, "step": 1}),
                "aspect_ratio": (["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"], {"default": "16:9"}),
            },
            "optional": {
                "negative_prompt": ("STRING", {"default": "", "multiline": True}),
                "character_url": ("STRING", {"default": "", "multiline": False}),
                "outfit_url": ("STRING", {"default": "", "multiline": False}),
                "scene_url": ("STRING", {"default": "", "multiline": False}),
                "reference_video_url": ("STRING", {"default": "", "multiline": False}),
                "camera": ("STRING", {"default": "", "multiline": False}),
                "motion": ("STRING", {"default": "", "multiline": False}),
                "continuity_group": ("STRING", {"default": "", "multiline": False}),
                "shot_id": ("STRING", {"default": "", "multiline": False}),
            },
        }

    def submit(
        self,
        auth: AuthBundle,
        prompt: str,
        duration: int,
        aspect_ratio: str,
        negative_prompt: str = "",
        character_url: str = "",
        outfit_url: str = "",
        scene_url: str = "",
        reference_video_url: str = "",
        camera: str = "",
        motion: str = "",
        continuity_group: str = "",
        shot_id: str = "",
    ):
        if not prompt.strip():
            raise ValueError("NextAPIGenerateVideo: prompt is empty")

        payload: dict = {
            "prompt": prompt.strip(),
            "duration": int(duration),
            "aspect_ratio": aspect_ratio,
        }
        if negative_prompt.strip():
            payload["negative_prompt"] = negative_prompt.strip()
        if camera.strip():
            payload["camera"] = camera.strip()
        if motion.strip():
            payload["motion"] = motion.strip()

        refs = {}
        if character_url.strip():
            refs["character_image_url"] = character_url.strip()
        if outfit_url.strip():
            refs["outfit_image_url"] = outfit_url.strip()
        if scene_url.strip():
            refs["scene_image_url"] = scene_url.strip()
        if reference_video_url.strip():
            refs["reference_video_url"] = reference_video_url.strip()
        if refs:
            payload["references"] = refs

        meta = {}
        if continuity_group.strip():
            meta["continuity_group"] = continuity_group.strip()
        if shot_id.strip():
            meta["shot_id"] = shot_id.strip()
        if meta:
            payload["metadata"] = meta

        resp = request_with_retry(
            "POST",
            auth.url("/v1/video/generations"),
            auth=auth,
            json_body=payload,
        )
        return (
            str(resp.get("id", "")),
            int(resp.get("estimated_credits") or 0),
            str(resp.get("status") or "queued"),
        )
