---
sidebar_position: 11
title: Webhooks
description: Configure outbound webhooks for job completion, batch completion, and credit alerts.
---

# Webhooks

NextAPI sends outbound webhooks to your server when important events occur — job completion, batch completion, and low credit alerts. This lets your workflow react in real time without polling.

---

## Overview

```
NextAPI  ──── HTTPS POST ────►  Your Server
         ← 200 OK (within 10s)
```

Each webhook delivery includes an **HMAC-SHA256 signature** so you can verify the payload came from NextAPI.

---

## Setting Up a Webhook

```http
POST /v1/webhooks
Authorization: Bearer <ak_admin_key>
Content-Type: application/json

{
  "url": "https://your-server.example.com/nextapi-events",
  "event_types": ["job.succeeded", "job.failed", "credits.low"]
}
```

Response:

```json
{
  "id": "wh_abc123",
  "url": "https://your-server.example.com/nextapi-events",
  "event_types": ["job.succeeded", "job.failed", "credits.low"],
  "secret": "whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "created_at": "2026-04-23T10:00:00Z"
}
```

:::warning Save the secret
The webhook secret is shown **once** at creation time and cannot be retrieved later. Store it securely as an environment variable.
:::

---

## Event Types

| Event | Triggered When |
|-------|---------------|
| `job.succeeded` | A video generation job completes successfully |
| `job.failed` | A job reaches the `failed` terminal state |
| `batch.completed` | All jobs in a batch run reach a terminal state |
| `credits.low` | Org credit balance drops below the configured alert threshold |

---

## Payload Structure

All events share a common envelope:

```json
{
  "event_type": "job.succeeded",
  "created_at": "2026-04-23T10:05:32Z",
  "data": { ... }
}
```

### `job.succeeded`

```json
{
  "event_type": "job.succeeded",
  "created_at": "2026-04-23T10:05:32Z",
  "data": {
    "id": "vid_xyz789",
    "job_id": "job_abc123",
    "video_id": "vid_xyz789",
    "status": "succeeded",
    "video_url": "https://cdn.nextapi.top/videos/vid_xyz789.mp4",
    "cost_credits": 50,
    "created_at": "2026-04-23T10:00:00Z"
  }
}
```

### `job.failed`

```json
{
  "event_type": "job.failed",
  "created_at": "2026-04-23T10:06:00Z",
  "data": {
    "id": "job_abc123",
    "job_id": "job_abc123",
    "video_id": "job_abc123",
    "status": "failed",
    "error_code": "provider_server_error",
    "error_message": "video generation failed after retries",
    "created_at": "2026-04-23T10:00:00Z"
  }
}
```

### `batch.completed`

```json
{
  "event_type": "batch.completed",
  "created_at": "2026-04-23T12:00:00Z",
  "data": {
    "batch_id": "br_batch456",
    "status": "partial_failure",
    "total_shots": 100,
    "succeeded_count": 97,
    "failed_count": 3,
    "completed_at": "2026-04-23T12:00:00Z"
  }
}
```

Batch status values:

| Status | Meaning |
|--------|---------|
| `completed` | All shots succeeded |
| `partial_failure` | Some shots succeeded, some failed |
| `failed` | All shots failed |

### `credits.low`

```json
{
  "event_type": "credits.low",
  "created_at": "2026-04-23T09:00:00Z",
  "data": {
    "org_id": "org_abc",
    "current_balance": 450,
    "alert_threshold": 500
  }
}
```

---

## Signature Verification

Every webhook delivery includes an `X-NextAPI-Signature` header:

```
X-NextAPI-Signature: sha256=<hex-encoded-hmac>
```

The HMAC is computed over the raw request body using SHA-256 and your webhook secret.

### Verify in Python

```python
import hmac
import hashlib

def verify_signature(payload_bytes: bytes, secret: str, signature_header: str) -> bool:
    expected = "sha256=" + hmac.new(
        secret.encode(),
        payload_bytes,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)

# In your handler:
raw_body = request.get_data()
sig = request.headers.get("X-NextAPI-Signature", "")
if not verify_signature(raw_body, WEBHOOK_SECRET, sig):
    return "invalid signature", 403
```

### Verify in Node.js

```javascript
const crypto = require("crypto");

function verifySignature(rawBody, secret, signatureHeader) {
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signatureHeader)
  );
}

// In your Express handler:
app.post("/nextapi-events", express.raw({ type: "*/*" }), (req, res) => {
  const sig = req.headers["x-nextapi-signature"] || "";
  if (!verifySignature(req.body, process.env.WEBHOOK_SECRET, sig)) {
    return res.status(403).send("invalid signature");
  }
  // process event
  res.status(200).send("ok");
});
```

---

## Delivery and Retry

### Timeout

NextAPI expects your server to respond within **10 seconds**. If the response takes longer, the delivery is marked as failed and will be retried.

### Retry Schedule

```
attempt 1 → immediate
attempt 2 → 30s delay
attempt 3 → 2m delay
attempt 4 → 10m delay
attempt 5 → 30m delay
```

After 5 failed delivery attempts, the delivery is marked as permanently failed and logged for operator review.

### Delivery Logs

```http
GET /v1/webhooks/<webhook_id>/deliveries
Authorization: Bearer <ak_admin_key>
```

```json
{
  "data": [
    {
      "id": 1,
      "webhook_id": "wh_abc123",
      "event_type": "job.succeeded",
      "status_code": 200,
      "attempt": 1,
      "delivered_at": "2026-04-23T10:05:33Z"
    },
    {
      "id": 2,
      "webhook_id": "wh_abc123",
      "event_type": "job.failed",
      "status_code": null,
      "error": "connection refused",
      "attempt": 3,
      "next_retry_at": "2026-04-23T10:16:00Z"
    }
  ]
}
```

### Manual Replay

To replay a failed delivery:

```http
POST /v1/internal/admin/webhooks/deliveries/<delivery_id>/replay
```

Or replay via the admin UI's webhook delivery detail view.

---

## Managing Webhooks

### List Webhooks

```http
GET /v1/webhooks
Authorization: Bearer <ak_admin_key>
```

### Get a Webhook

```http
GET /v1/webhooks/<webhook_id>
```

### Delete a Webhook

```http
DELETE /v1/webhooks/<webhook_id>
```

### Rotate the Secret

```http
POST /v1/webhooks/<webhook_id>/rotate
```

Returns the new secret. Update your server's environment variable immediately — the old secret stops working right away.

---

## Idempotency

Each webhook delivery has a unique `delivery_id`. If your server receives the same delivery twice (e.g. due to a network retry), you can use the delivery ID in the `X-Delivery-Id` header to deduplicate:

```
X-Delivery-Id: delivery_00001
```

Store processed delivery IDs in your database and skip re-processing if already seen.

---

## Webhook URL Security

NextAPI validates webhook URLs at creation time:

- Must use `https://`
- Must not point to private/internal IP ranges (SSRF protection)
- Must not point to link-shorteners or redirect services

If your webhook URL fails validation, the create request returns `400 invalid_webhook_url`.

---

## Troubleshooting

**Webhook is not arriving?**
1. Check that the webhook is not disabled (call `GET /v1/webhooks/<id>` and check `disabled_at`).
2. Check delivery logs for error messages.
3. Verify your server responds within 10 seconds.
4. Confirm the event type is in the webhook's `event_types` list.

**Signature verification fails?**
1. Make sure you're computing HMAC over the **raw bytes** of the body, not a parsed JSON object.
2. Use constant-time comparison (`hmac.compare_digest` / `crypto.timingSafeEqual`).
3. Check you're using the correct secret — it's shown only at creation or after rotation.

**Getting 401 or 403 from your server?**
- NextAPI does not follow redirects. Ensure the webhook URL is the final destination.
- If your server requires authentication headers, use a URL with a secret token in the path: `https://your-server.example.com/hook/secret-token`.
