"""
Simulate 100 concurrent browser sessions via the API + Redis bridge.

This test creates multiple tasks concurrently and monitors their execution
sessions without launching real Playwright browsers. It verifies the system
can handle the orchestration overhead of 100 simultaneous sessions.
"""
import asyncio
import aiohttp
import time
import statistics
import sys

BASE_URL = "http://localhost:4000"
NUM_SESSIONS = 100
CONCURRENCY_BATCH = 20
TIMEOUT = 30


class SessionStats:
    def __init__(self):
        self.times = []
        self.errors = []
        self.statuses = []

    def add(self, time_sec, status, error=None):
        self.times.append(time_sec)
        self.statuses.append(status)
        if error:
            self.errors.append(error)

    @property
    def success_count(self):
        return sum(1 for s in self.statuses if s == "created")

    @property
    def p50(self):
        return statistics.median(self.times) if self.times else 0

    @property
    def p95(self):
        if not self.times:
            return 0
        sorted_t = sorted(self.times)
        idx = int(len(sorted_t) * 0.95)
        return sorted_t[min(idx, len(sorted_t) - 1)]

    @property
    def p99(self):
        if not self.times:
            return 0
        sorted_t = sorted(self.times)
        idx = int(len(sorted_t) * 0.99)
        return sorted_t[min(idx, len(sorted_t) - 1)]


async def register_user(session, idx):
    email = f"browser-load-{idx}-{int(time.time())}@test.com"
    async with session.post(
        f"{BASE_URL}/auth/register",
        json={"email": email, "password": "ValidPass1!", "name": f"Browser Load {idx}"},
    ) as resp:
        data = await resp.json()
        return data.get("accessToken")


async def create_task(session, token, goal):
    start = time.time()
    async with session.post(
        f"{BASE_URL}/agent/tasks",
        json={"goal": goal},
        headers={"Authorization": f"Bearer {token}"},
    ) as resp:
        elapsed = time.time() - start
        data = await resp.json()
        return elapsed, resp.status, data


async def run_session(session, idx, stats):
    try:
        token = await register_user(session, idx)
        if not token:
            stats.add(0, "register_failed", "no token")
            return

        goals = [
            "search for cheap flights from new york to london",
            "book a hotel in paris for 3 nights",
            "order food from a nearby italian restaurant",
            "find research papers on machine learning",
            "schedule a meeting for next monday",
        ]
        goal = goals[idx % len(goals)]

        elapsed, status, data = await create_task(session, token, goal)
        if status == 201:
            stats.add(elapsed, "created", None)

            task_id = data.get("id")
            async with session.get(
                f"{BASE_URL}/agent/tasks/{task_id}",
                headers={"Authorization": f"Bearer {token}"},
            ) as resp:
                if resp.status == 200:
                    stats.add(0, "retrieved", None)

            async with session.get(
                f"{BASE_URL}/agent/sessions",
                headers={"Authorization": f"Bearer {token}"},
            ) as resp:
                if resp.status == 200:
                    stats.add(0, "sessions", None)
        else:
            stats.add(elapsed, f"http_{status}", str(data))
    except Exception as e:
        stats.add(0, "exception", str(e))


async def main():
    print(f"=== Browser Session Concurrency Test ===")
    print(f"Sessions: {NUM_SESSIONS}")
    print(f"Batch size: {CONCURRENCY_BATCH}")
    print(f"Timeout: {TIMEOUT}s")
    print(f"Target: {BASE_URL}\n")

    stats = SessionStats()
    connector = aiohttp.TCPConnector(limit=CONCURRENCY_BATCH)
    timeout_obj = aiohttp.ClientTimeout(total=TIMEOUT)

    async with aiohttp.ClientSession(connector=connector, timeout=timeout_obj) as session:
        tasks = [run_session(session, i, stats) for i in range(NUM_SESSIONS)]
        start = time.time()

        for i in range(0, NUM_SESSIONS, CONCURRENCY_BATCH):
            batch = tasks[i : i + CONCURRENCY_BATCH]
            await asyncio.gather(*batch)
            done = min(i + CONCURRENCY_BATCH, NUM_SESSIONS)
            print(f"  Progress: {done}/{NUM_SESSIONS} sessions completed")

        total_time = time.time() - start

    print(f"\n=== Results ===")
    print(f"Total time: {total_time:.2f}s")
    print(f"Successfully created: {stats.success_count}/{NUM_SESSIONS}")
    print(f"Errors: {len(stats.errors)}")
    print(f"Task creation latency:")
    print(f"  P50: {stats.p50*1000:.0f}ms")
    print(f"  P95: {stats.p95*1000:.0f}ms")
    print(f"  P99: {stats.p99*1000:.0f}ms")

    if stats.errors:
        print(f"\nErrors ({len(stats.errors)}):")
        for err in stats.errors[:10]:
            print(f"  - {err}")

    success_rate = stats.success_count / NUM_SESSIONS * 100
    print(f"\nSuccess rate: {success_rate:.1f}%")
    if success_rate >= 95:
        print("RESULT: PASS (>=95% success)")
    else:
        print("RESULT: FAIL (<95% success)")
    sys.exit(0 if success_rate >= 95 else 1)


if __name__ == "__main__":
    asyncio.run(main())
