"""Network monitor — records all HTTP traffic, API calls, and rate limiting detection."""

import asyncio
import json
import logging
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

log = logging.getLogger("browser-py.engine.network_monitor")

_API_PATTERNS = ("/api/", "/graphql", "/v1/", "/v2/", "/v3/", "rest/", ".json")
_GRAPHQL_BODY = ("query", "mutation", "subscription")


@dataclass
class NetworkRequest:
    request_id: str
    url: str
    method: str
    headers: dict
    post_data: Optional[str]
    timestamp: float
    resource_type: str


@dataclass
class NetworkResponse:
    request_id: str
    url: str
    status_code: int
    headers: dict
    body_preview: str       # first 500 chars
    response_time_ms: float
    is_api_call: bool
    is_graphql: bool
    is_websocket: bool


@dataclass
class NetworkFailure:
    request_id: str
    url: str
    error_text: str
    timestamp: float


class NetworkMonitor:
    """Records all HTTP activity via Playwright request/response events."""

    def __init__(self):
        self._requests: deque = deque(maxlen=500)
        self._responses: deque = deque(maxlen=500)
        self._failures: deque = deque(maxlen=500)
        self._pending: dict[str, float] = {}      # request_id -> start_time
        self._handlers_attached = False
        self._request_counter = 0

    def attach(self, page) -> None:
        """Install request/response/failure listeners on the Playwright page."""
        if self._handlers_attached:
            return

        page.on("request", self._on_request)
        page.on("response", self._on_response)
        page.on("requestfailed", self._on_request_failed)
        self._handlers_attached = True
        log.debug("NetworkMonitor attached to page")

    def detach(self, page) -> None:
        """Remove listeners."""
        try:
            page.remove_listener("request", self._on_request)
            page.remove_listener("response", self._on_response)
            page.remove_listener("requestfailed", self._on_request_failed)
        except Exception:
            pass
        self._handlers_attached = False

    # Playwright event handlers are sync
    def _on_request(self, request) -> None:
        self._request_counter += 1
        req_id = str(self._request_counter)
        url = ""
        method = "GET"
        headers = {}
        post_data = None
        resource_type = ""
        try:
            url = request.url
            method = request.method
            headers = dict(request.headers or {})
            post_data = request.post_data
            resource_type = request.resource_type or ""
        except Exception:
            pass

        # Attach id for correlation
        try:
            request._monitor_id = req_id
        except Exception:
            pass

        self._pending[req_id] = time.time()
        self._requests.append(NetworkRequest(
            request_id=req_id,
            url=url,
            method=method,
            headers=headers,
            post_data=post_data,
            timestamp=time.time(),
            resource_type=resource_type,
        ))

    def _on_response(self, response) -> None:
        url = ""
        status = 0
        headers = {}
        body_preview = ""
        resource_type = ""
        req_id = "?"

        try:
            url = response.url
            status = response.status
            headers = dict(response.headers or {})
            resource_type = response.request.resource_type or ""
        except Exception:
            pass

        # Get req_id from pending by URL match (best effort)
        for rid, t in list(self._pending.items()):
            for req in self._requests:
                if req.request_id == rid and req.url == url:
                    req_id = rid
                    break
            if req_id != "?":
                break

        elapsed_ms = 0.0
        if req_id in self._pending:
            elapsed_ms = (time.time() - self._pending.pop(req_id)) * 1000

        # Find original post_data for graphql detection
        post_data = ""
        for req in self._requests:
            if req.url == url:
                post_data = req.post_data or ""
                break

        is_api = self._is_api_call(url, resource_type)
        is_graphql = self._is_graphql(url, post_data)
        is_ws = resource_type == "websocket" or url.startswith("ws")

        self._responses.append(NetworkResponse(
            request_id=req_id,
            url=url,
            status_code=status,
            headers=headers,
            body_preview=body_preview,
            response_time_ms=elapsed_ms,
            is_api_call=is_api,
            is_graphql=is_graphql,
            is_websocket=is_ws,
        ))

    def _on_request_failed(self, request) -> None:
        url = ""
        error = ""
        try:
            url = request.url
            error = request.failure or "unknown"
        except Exception:
            pass
        self._failures.append(NetworkFailure(
            request_id="failed",
            url=url,
            error_text=str(error),
            timestamp=time.time(),
        ))

    # ── Query methods ────────────────────────────────────────────────────────

    def get_requests(self) -> list:
        return list(self._requests)

    def get_responses(self) -> list:
        return list(self._responses)

    def get_failures(self) -> list:
        return list(self._failures)

    def get_api_calls(self) -> list:
        return [r for r in self._responses if r.is_api_call]

    def get_slow_requests(self, threshold_ms: float = 3000) -> list:
        return [r for r in self._responses if r.response_time_ms > threshold_ms]

    def detect_rate_limiting(self) -> bool:
        """Return True if a 429 response was seen in the last 60 seconds."""
        cutoff = time.time() - 60
        for req in self._requests:
            if req.timestamp < cutoff:
                continue
            for resp in self._responses:
                if resp.url == req.url and resp.status_code == 429:
                    return True
        return any(r.status_code == 429 for r in self._responses)

    def get_summary(self) -> dict:
        responses = list(self._responses)
        durations = [r.response_time_ms for r in responses if r.response_time_ms > 0]
        avg_ms = sum(durations) / len(durations) if durations else 0.0
        return {
            "total_requests": len(self._requests),
            "total_responses": len(responses),
            "total_failures": len(self._failures),
            "api_call_count": sum(1 for r in responses if r.is_api_call),
            "graphql_count": sum(1 for r in responses if r.is_graphql),
            "average_response_ms": round(avg_ms, 1),
            "rate_limited": self.detect_rate_limiting(),
            "error_4xx": sum(1 for r in responses if 400 <= r.status_code < 500),
            "error_5xx": sum(1 for r in responses if r.status_code >= 500),
        }

    def clear(self) -> None:
        self._requests.clear()
        self._responses.clear()
        self._failures.clear()
        self._pending.clear()

    # ── Private helpers ───────────────────────────────────────────────────────

    def _is_api_call(self, url: str, resource_type: str) -> bool:
        url_lower = url.lower()
        return (
            any(p in url_lower for p in _API_PATTERNS)
            or resource_type in ("xhr", "fetch")
        )

    def _is_graphql(self, url: str, body: str) -> bool:
        if "/graphql" in url.lower():
            return True
        if body:
            try:
                data = json.loads(body)
                return any(k in data for k in _GRAPHQL_BODY)
            except Exception:
                return any(kw in body.lower() for kw in _GRAPHQL_BODY)
        return False
