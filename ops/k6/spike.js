import http from 'k6/http';
import { check } from 'k6';

// Spike test: shock the infrastructure with 1000 concurrent VUs for 10 minutes.
// Only hits /health so we measure the edge/ingress, not business logic.
export const options = {
  stages: [
    { duration: '30s', target: 1000 },  // rapid ramp
    { duration: '9m',  target: 1000 },  // hold spike
    { duration: '30s', target: 0    },  // drain
  ],
  thresholds: {
    // Infra breathing test — be generous but still bounded.
    http_req_failed:   ['rate<0.05'],
    http_req_duration: ['p(95)<2000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

export default function () {
  const res = http.get(`${BASE_URL}/health`);
  check(res, {
    'status is 200': (r) => r.status === 200,
  });
}
