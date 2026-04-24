import http from 'k6/http';
import { check } from 'k6';
import { Rate } from 'k6/metrics';

// Baseline: sustained 50 VUs hitting the video generation endpoint
// using cheapest (mock-friendly) parameters.
const errorRate = new Rate('error_rate');

export const options = {
  stages: [
    { duration: '30s', target: 50 },  // ramp up
    { duration: '2m',  target: 50 },  // steady state
    { duration: '30s', target: 0  },  // ramp down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500'],
    'error_rate':        ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const API_KEY  = __ENV.K6_API_KEY || __ENV.API_KEY;

export function setup() {
  if (!API_KEY) {
    throw new Error('K6_API_KEY or API_KEY is required (cd backend && go run ./cmd/k6seed)');
  }
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    throw new Error(`Backend health check failed: ${res.status}`);
  }
  return { startedAt: Date.now() };
}

export default function () {
  const payload = JSON.stringify({
    model: 'seedance-2.0-pro',
    input: {
      prompt: 'a cat walking',
      duration_seconds: 2,
      mode: 'fast',
      resolution: '480p',
    },
  });

  const res = http.post(`${BASE_URL}/v1/videos`, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    tags: { endpoint: 'videos_create' },
  });

  const ok = check(res, {
    '202': (r) => r.status === 202,
  });
  errorRate.add(!ok);
}

export function teardown(data) {
  const elapsed = (Date.now() - data.startedAt) / 1000;
  console.log(`baseline finished in ${elapsed}s`);
}
