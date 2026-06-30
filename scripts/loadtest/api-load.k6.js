import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { SharedArray } from 'k6/data';
import { Rate, Trend } from 'k6/metrics';

const baseUrl = __ENV.BASE_URL || 'http://localhost:4000';

const failRate = new Rate('failed_requests');
const authDuration = new Trend('auth_duration');
const taskDuration = new Trend('task_duration');
const memoryDuration = new Trend('memory_duration');

const users = new SharedArray('users', function () {
  return Array.from({ length: 1000 }, (_, i) => ({
    email: `load-${i}-${Date.now()}@test.com`,
    password: 'LoadTest1!',
    name: `Load User ${i}`,
  }));
});

export const options = {
  stages: [
    { duration: '30s', target: 100 },
    { duration: '30s', target: 500 },
    { duration: '30s', target: 1000 },
    { duration: '60s', target: 1000 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    failed_requests: ['rate<0.05'],
    http_req_duration: ['p(95)<2000'],
    auth_duration: ['p(95)<3000'],
    task_duration: ['p(95)<5000'],
  },
};

export default function () {
  const idx = (__VU - 1) % users.length;
  const user = users[idx];

  group('Auth Flow', function () {
    const registerRes = http.post(`${baseUrl}/auth/register`, JSON.stringify({
      email: user.email,
      password: user.password,
      name: user.name,
    }), { headers: { 'Content-Type': 'application/json' } });

    authDuration.add(registerRes.timings.duration);
    failRate.add(registerRes.status !== 201 && registerRes.status !== 409);

    const token = registerRes.status === 201
      ? registerRes.json('accessToken')
      : (() => {
          const loginRes = http.post(`${baseUrl}/auth/login`, JSON.stringify({
            email: user.email,
            password: user.password,
          }), { headers: { 'Content-Type': 'application/json' } });
          return loginRes.json('accessToken');
        })();

    check(token, { 'got auth token': (t) => t !== undefined });

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    group('Profile', function () {
      const profileRes = http.get(`${baseUrl}/auth/profile`, { headers });
      check(profileRes, { 'profile ok': (r) => r.status === 200 });
    });

    group('Task Operations', function () {
      const taskRes = http.post(`${baseUrl}/agent/tasks`, JSON.stringify({
        goal: 'search for cheap flights from new york to london',
      }), { headers });

      taskDuration.add(taskRes.timings.duration);
      failRate.add(taskRes.status !== 201);

      if (taskRes.status === 201) {
        const taskId = taskRes.json('id');
        const listRes = http.get(`${baseUrl}/agent/tasks`, { headers });
        check(listRes, { 'tasks listed': (r) => r.status === 200 });

        const getRes = http.get(`${baseUrl}/agent/tasks/${taskId}`, { headers });
        check(getRes, { 'task detail ok': (r) => r.status === 200 });
      }
    });

    group('Memory Operations', function () {
      const memRes = http.get(`${baseUrl}/memory`, { headers });
      memoryDuration.add(memRes.timings.duration);
      check(memRes, { 'memory list ok': (r) => r.status === 200 });

      const searchRes = http.get(`${baseUrl}/memory/search?q=test`, { headers });
      check(searchRes, { 'memory search ok': (r) => r.status === 200 });
    });

    group('Session Operations', function () {
      const sessionRes = http.get(`${baseUrl}/agent/sessions`, { headers });
      check(sessionRes, { 'sessions ok': (r) => r.status === 200 });
    });
  });

  sleep(1);
}
