# nextapi (Node.js / TypeScript)

Official Node.js SDK for [NextAPI](https://api.nextapi.top). Requires Node 20+.

## Install

```bash
npm install nextapi
```

## Usage

```ts
import { NextAPI } from "nextapi";

const client = new NextAPI({ apiKey: process.env.NEXTAPI_KEY! });

const job = await client.generate({
  prompt: "A cat surfing on a rainbow",
  model: "seedance-v2-pro",
  durationSeconds: 5,
  resolution: "1080p",
});

console.log(job.id, job.status, job.estimated_cost_cents);

const final = await client.wait(job.id);
console.log(final);
```

## Errors

Non-2xx responses throw a `NextAPIError` with `code`, `message`, and `statusCode`.
