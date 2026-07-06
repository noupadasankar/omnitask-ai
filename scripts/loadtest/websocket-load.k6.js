import ws from 'k6/ws';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const baseUrl = __ENV.BASE_URL || 'http://localhost:4000';
const wsUrl = __ENV.WS_URL || 'ws://localhost:4000';

const connectRate = new Rate('ws_connect_success');
const eventRate = new Rate('ws_event_received');
const connectDuration = new Trend('ws_connect_duration');

export const options = {
  stages: [
    { duration: '30s', target: 1000 },
    { duration: '30s', target: 5000 },
    { duration: '30s', target: 10000 },
    { duration: '60s', target: 10000 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    ws_connect_success: ['rate>0.90'],
    ws_connect_duration: ['p(95)<3000'],
  },
};

function registerUser(baseUrl) {
  const email = `ws-load-${__VU}-${Date.now()}@test.com`;
  const res = http.post(`${baseUrl}/auth/register`, JSON.stringify({
    email,
    password: 'ValidPass1!',
    name: `WS Load ${__VU}`,
  }), { headers: { 'Content-Type': 'application/json' } });
  return { email, token: res.json('accessToken') };
}

export default function () {
  group('WebSocket Connection', function () {
    const start = Date.now();
    const { token } = registerUser(baseUrl);

    const url = `${wsUrl}?token=${token}`;
    const res = ws.connect(url, {}, function (socket) {
      socket.on('open', function () {
        connectRate.add(1);
        connectDuration.add(Date.now() - start);
      });

      socket.on('error', function (e) {
        connectRate.add(0);
      });

      socket.on('message', function (data) {
        eventRate.add(1);
      });

      socket.setTimeout(function () {
        socket.close();
      }, 10000);
    });

    check(res, { 'websocket connected': (r) => r && r.status === 101 });
  });

  sleep(0.5);
}
