# Email OTP + Easypay Top-up

## Goal

Add a first-party customer flow without changing the existing video job API:

1. User requests an email verification code.
2. User signs in with the code.
3. Dashboard creates an Easypay top-up order.
4. Easypay calls the payment webhook.
5. Backend verifies the signature, checks the amount, marks the order paid once, and appends a top-up row to `credits_ledger`.
6. Existing spend enforcement and video billing continue to use the same ledger balance.

## Boundaries

- Keep video generation endpoints unchanged.
- Keep the existing Go/Gin API as the source of truth. Do not add a separate Next.js/Prisma payment backend that could bypass ledger enforcement.
- Store OTPs in Redis under `auth:code:{email}` with a 300 second TTL.
- Store send cooldowns in Redis under `auth:code-cooldown:{email}` with a 60 second TTL.
- If `RESEND_API_KEY` is not configured, OTP send returns `email_provider_unavailable` instead of pretending an email was sent.
- Store top-up order state in `topup_orders`; store final balance changes only in `credits_ledger`.
- Process Easypay callbacks idempotently. A paid order cannot credit the org twice.

## Routes

- `POST /v1/auth/send-code` and `POST /v1/auth/otp/send`
  - Public, rate limited.
  - Body: `{ "email": "user@example.com" }`
  - Sends `你的验证码是：123456（5分钟有效）`.

- `POST /v1/auth/login`
  - Existing password login remains supported.
  - Code login body: `{ "email": "user@example.com", "code": "123456" }`
  - Creates the user/org if needed, creates a first-party account session, and returns a dashboard API key.

- `POST /v1/pay/create`
  - Authenticated dashboard/business route.
  - Body: `{ "amount_cents": 1000, "payment_type": "alipay" }`
  - Creates a pending `topup_orders` row and returns an Easypay URL.

- `GET|POST /api/pay/notify` and `POST /v1/webhooks/payments/easypay`
  - Public provider callback.
  - Verifies signature, validates amount against the pending order, atomically marks paid, appends a `credits_ledger` top-up row, and returns `success`.

## Required Secrets

- `RESEND_API_KEY`: Resend API key for sending OTP email.
- `NOTIFY_FROM`: verified sender, for example `NextAPI <noreply@nextapi.top>`.
- `EPAY_PID`: Easypay merchant ID.
- `EPAY_KEY`: Easypay merchant secret key.
- `EPAY_GATEWAY`: Easypay submit endpoint, for example `https://zpayz.cn/submit.php`.
- `EPAY_NOTIFY_URL`: public async callback URL, for example `https://api.nextapi.top/api/pay/notify`.
- `EPAY_RETURN_URL`: dashboard return URL after payment.
- `API_PUBLIC_URL`: public API origin, for example `https://api.nextapi.top`.
- `CHECKOUT_SUCCESS_URL`: dashboard return URL after payment.
