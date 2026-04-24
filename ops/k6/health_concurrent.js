import http from 'k6/http';
import { check } from 'k6';

// 100 VUs against /health — ingress + Gin + DB-free path (no API key).
export const options = {
  stages: [
    { duration: '15s', target: 100 },
    { duration: '45s', target: 100 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<500'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:8080';

export default function () {
  const res = http.get(`${BASE_URL}/health`);
  check(res, { '200': (r) => r.status === 200 });
}
