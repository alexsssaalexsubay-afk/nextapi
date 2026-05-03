"""ComfyUI-NextAPI custom node package.

ComfyUI auto-discovers `NODE_CLASS_MAPPINGS` and `NODE_DISPLAY_NAME_MAPPINGS`
exported from the package root. We import each node module here and expose
their mappings as a single dict.
"""

from .nodes.auth import NextAPIAuth
from .nodes.asset_resolver import NextAPIAssetResolver
from .nodes.director_plan import NextAPIDirectorPlan
from .nodes.generate_video import NextAPIGenerateVideo
from .nodes.poll_job import NextAPIPollJob
from .nodes.download_result import NextAPIDownloadResult


NODE_CLASS_MAPPINGS = {
    "NextAPIAuth": NextAPIAuth,
    "NextAPIAssetResolver": NextAPIAssetResolver,
    "NextAPIDirectorPlan": NextAPIDirectorPlan,
    "NextAPIGenerateVideo": NextAPIGenerateVideo,
    "NextAPIPollJob": NextAPIPollJob,
    "NextAPIDownloadResult": NextAPIDownloadResult,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "NextAPIAuth": "NextAPI · Auth",
    "NextAPIAssetResolver": "NextAPI · Asset Resolver",
    "NextAPIDirectorPlan": "NextAPI · Director Plan",
    "NextAPIGenerateVideo": "NextAPI · Generate Video",
    "NextAPIPollJob": "NextAPI · Poll Job",
    "NextAPIDownloadResult": "NextAPI · Download Result",
}

WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
