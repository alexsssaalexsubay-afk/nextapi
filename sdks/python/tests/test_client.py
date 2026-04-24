import httpx
import pytest
import respx

from nextapi import Client, NextAPIError

BASE = "https://api.nextapi.top"


@respx.mock
def test_generate_returns_job():
    route = respx.post(f"{BASE}/v1/videos").mock(
        return_value=httpx.Response(
            200,
            json={"id": "vid_123", "status": "queued", "estimated_cost_cents": 42},
        )
    )
    with Client(api_key="sk-test") as c:
        r = c.generate(prompt="hi")
    assert route.called
    req = route.calls.last.request
    assert req.headers["authorization"] == "Bearer sk-test"
    assert req.headers["content-type"] == "application/json"
    assert r == {"id": "vid_123", "status": "queued", "estimated_cost_cents": 42}


@respx.mock
def test_get_job():
    respx.get(f"{BASE}/v1/videos/vid_123").mock(
        return_value=httpx.Response(200, json={"id": "vid_123", "status": "succeeded"})
    )
    with Client(api_key="sk-test") as c:
        r = c.get_job("vid_123")
    assert r["status"] == "succeeded"


@respx.mock
def test_error_mapping():
    respx.post(f"{BASE}/v1/videos").mock(
        return_value=httpx.Response(
            400, json={"error": {"code": "bad_request", "message": "nope"}}
        )
    )
    with Client(api_key="sk-test") as c:
        with pytest.raises(NextAPIError) as ei:
            c.generate(prompt="hi")
    assert ei.value.code == "bad_request"
    assert ei.value.status_code == 400


@respx.mock
def test_wait_polls_until_terminal():
    respx.get(f"{BASE}/v1/videos/j1").mock(
        side_effect=[
            httpx.Response(200, json={"id": "j1", "status": "queued"}),
            httpx.Response(200, json={"id": "j1", "status": "running"}),
            httpx.Response(200, json={"id": "j1", "status": "succeeded", "output": "x"}),
        ]
    )
    with Client(api_key="sk-test") as c:
        r = c.wait("j1", timeout=10, poll_interval=0)
    assert r["status"] == "succeeded"
