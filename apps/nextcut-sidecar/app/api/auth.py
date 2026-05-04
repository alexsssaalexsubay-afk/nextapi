from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class LicenseValidateRequest(BaseModel):
    token: str


class AccountStatus(BaseModel):
    tier: str
    authenticated: bool
    email: str | None = None
    credits: int = 0
    max_projects: int = 3
    max_shots_per_project: int = 5
    watermark: bool = True


@router.get("/status")
async def auth_status():
    # TODO(claude): Implement Clerk SSO and license validation
    return AccountStatus(
        tier="free",
        authenticated=False,
        max_projects=3,
        max_shots_per_project=5,
        watermark=True,
    ).model_dump()


@router.post("/validate-license")
async def validate_license(request: LicenseValidateRequest):
    # TODO(claude): Implement offline license token validation
    return {"valid": False, "message": "License validation not implemented"}


@router.post("/clerk-callback")
async def clerk_callback():
    # TODO(claude): Implement Clerk SSO callback
    return {"status": "not_implemented"}
