import http from 'k6/http';
import { check } from 'k6';
import { Rate } from 'k6/metrics';

// Sustained POST /v1/videos (mock provider: cheap params). Requires K6_API_KEY.
const errorRate = new Rate('error_rate');

export const options = {
  stages: [
    { duration: '20s', target: 100 },
    { duration: '60s', target: 100 },
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    error_rate: ['rate<0.15'],
    http_req_duration: ['p(95)<3000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:8080';
const API_KEY = __ENV.K6_API_KEY || __ENV.API_KEY;

export function setup() {
  if (!API_KEY) {
    throw new Error('Set K6_API_KEY (from: cd backend && go run ./cmd/k6seed)');
  }
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    throw new Error(`health failed: ${res.status}`);
  }
  return { t0: Date.now() };
}

export default function () {
  const body = JSON.stringify({
    model: 'seedance-2.0-pro',
    input: {
      prompt: 'k6 concurrent load',
      duration_seconds: 2,
      resolution: '480p',
      mode: 'fast',
    },
  });
  const res = http.post(`${BASE_URL}/v1/videos`, body, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    tags: { name: 'POST /v1/videos' },
  });
  const ok = check(res, {
    '202 or 402 or 429': (r) =>
      r.status === 202 || r.status === 402 || r.status === 429,
  });
  errorRate.add(!ok);
}

export function teardown(data) {
  console.log(`videos_concurrent done in ${((Date.now() - data.t0) / 1000).toFixed(1)}s`);
}
