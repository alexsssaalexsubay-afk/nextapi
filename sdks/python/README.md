# nextapi (Python)

Official Python SDK for [NextAPI](https://api.nextapi.top).

## Install

```bash
pip install nextapi
```

## Usage

```python
from nextapi import Client

client = Client(api_key="sk-...")

job = client.generate(
    prompt="A cat surfing on a rainbow",
    model="seedance-v2-pro",
    duration_seconds=5,
    resolution="1080p",
)
print(job["id"], job["status"], job["estimated_credits"])

final = client.wait(job["id"])
print(final)
```

## Errors

Non-2xx responses raise `NextAPIError` with `.code`, `.message`, and `.status_code`.
