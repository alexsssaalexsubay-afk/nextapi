from fastapi import APIRouter, Header
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


class TeamMemberRequest(BaseModel):
    email: str | None = None
    role: str = "member"


@router.get("/status")
async def auth_status(x_nextapi_session: str | None = Header(default=None, alias="X-NextAPI-Session")):
    if x_nextapi_session:
        import httpx

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    "https://api.nextapi.top/v1/auth/session",
                    headers={"X-NextAPI-Session": x_nextapi_session},
                )
            if response.status_code == 200:
                data = response.json()
                user = data.get("user") or {}
                return AccountStatus(
                    tier="team",
                    authenticated=True,
                    email=user.get("email"),
                    credits=int(data.get("balance") or 0),
                    max_projects=999,
                    max_shots_per_project=999,
                    watermark=False,
                ).model_dump()
        except Exception:
            pass

    return AccountStatus(
        tier="free",
        authenticated=False,
        max_projects=3,
        max_shots_per_project=5,
        watermark=True,
    ).model_dump()


@router.get("/team")
async def auth_team(x_nextapi_session: str | None = Header(default=None, alias="X-NextAPI-Session")):
    from fastapi import HTTPException

    if not x_nextapi_session:
        raise HTTPException(status_code=401, detail="missing session")

    import httpx

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://api.nextapi.top/v1/auth/team",
                headers={"X-NextAPI-Session": x_nextapi_session},
            )
        if response.status_code == 200:
            return response.json()
        try:
            detail = response.json()
        except Exception:
            detail = response.text
        raise HTTPException(status_code=response.status_code, detail=detail)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to connect to NextAPI: {str(e)}")


async def _proxy_team_mutation(method: str, path: str, token: str | None, payload: dict | None = None):
    from fastapi import HTTPException

    if not token:
        raise HTTPException(status_code=401, detail="missing session")

    import httpx

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.request(
                method,
                f"https://api.nextapi.top/v1{path}",
                headers={"X-NextAPI-Session": token},
                json=payload,
            )
        if response.status_code < 400:
            return response.json() if response.content else {"ok": True}
        try:
            detail = response.json()
        except Exception:
            detail = response.text
        raise HTTPException(status_code=response.status_code, detail=detail)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to connect to NextAPI: {str(e)}")


@router.post("/team/members")
async def auth_add_team_member(request: TeamMemberRequest, x_nextapi_session: str | None = Header(default=None, alias="X-NextAPI-Session")):
    return await _proxy_team_mutation("POST", "/auth/team/members", x_nextapi_session, request.model_dump(exclude_none=True))


@router.patch("/team/members/{user_id}")
async def auth_update_team_member(user_id: str, request: TeamMemberRequest, x_nextapi_session: str | None = Header(default=None, alias="X-NextAPI-Session")):
    return await _proxy_team_mutation("PATCH", f"/auth/team/members/{user_id}", x_nextapi_session, {"role": request.role})


@router.delete("/team/members/{user_id}")
async def auth_remove_team_member(user_id: str, x_nextapi_session: str | None = Header(default=None, alias="X-NextAPI-Session")):
    return await _proxy_team_mutation("DELETE", f"/auth/team/members/{user_id}", x_nextapi_session)


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
