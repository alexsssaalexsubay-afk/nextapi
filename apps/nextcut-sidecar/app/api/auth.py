from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class LicenseValidateRequest(BaseModel):
    token: str


class AccountStatus(BaseModel):
    tier: str = "free"
    authenticated: bool = False
    email: str | None = None
    credits: int = 0
    max_projects: int = 3
    max_shots_per_project: int = 5
    watermark: bool = True


class LoginRequest(BaseModel):
    email: str
    password: str


@router.get("/status")
async def auth_status():
    # Return current session status from Sidecar context if available
    return AccountStatus(
        tier="free",
        authenticated=False,
        max_projects=3,
        max_shots_per_project=5,
        watermark=True,
    ).model_dump()


@router.post("/login")
async def login_with_password(request: LoginRequest):
    """
    Proxies the login request to the main NextAPI site to retrieve the session token
    and API key. This keeps the credentials secure and avoids CORS issues.
    """
    import httpx
    
    url = "https://api.nextapi.top/v1/auth/login"
    payload = {
        "email": request.email,
        "password": request.password
    }
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json=payload)
            
            if response.status_code == 200:
                data = response.json()
                return data
            else:
                from fastapi import HTTPException
                try:
                    error_data = response.json()
                    msg = error_data.get("error", {}).get("message", "Login failed")
                except:
                    msg = "Invalid email or password"
                raise HTTPException(status_code=response.status_code, detail=msg)
                
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=f"Failed to connect to NextAPI: {str(e)}")


@router.post("/validate-license")
async def validate_license(request: LicenseValidateRequest):
    # TODO(claude): Implement offline license token validation
    return {"valid": False, "message": "License validation not implemented"}


@router.post("/clerk-callback")
async def clerk_callback():
    # TODO(claude): Implement Clerk SSO callback
    return {"status": "not_implemented"}
