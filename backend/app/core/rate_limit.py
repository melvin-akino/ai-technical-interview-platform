"""In-memory, per-IP sliding-window rate limiting.

The backend runs as a single uvicorn process, so an in-process counter is sufficient and
avoids a Redis dependency. If the app is ever scaled to multiple workers or instances, this
must move to a shared store (each process would otherwise keep its own counts).

Usage — attach as a route dependency:

    from app.core.rate_limit import rate_limit
    GEMINI_HEAVY = rate_limit("gemini_heavy", [(5, 60), (30, 3600)])

    @router.post("/upload", dependencies=[Depends(GEMINI_HEAVY)])
    async def upload_resume(...):
        ...
"""
import time
import threading
from collections import defaultdict, deque

from fastapi import Request, HTTPException

from app.core.config import settings

_lock = threading.Lock()
_hits: dict[str, deque] = defaultdict(deque)
_last_sweep = 0.0
_SWEEP_INTERVAL = 300  # seconds between cleanups of idle keys


def get_client_ip(request: Request) -> str:
    """Resolve the real client IP behind the trusted proxy chain.

    X-Forwarded-For accumulates left-to-right as it passes through proxies, so the last
    TRUSTED_PROXY_HOPS entries were added by our own Caddy/nginx and are trustworthy; the
    real client is the entry just before them. Entries further left are attacker-controllable
    and are ignored — otherwise a spoofed header would let one client masquerade as many.
    """
    xff = request.headers.get("x-forwarded-for", "")
    parts = [p.strip() for p in xff.split(",") if p.strip()]
    hops = max(1, settings.TRUSTED_PROXY_HOPS)
    if len(parts) >= hops:
        return parts[-hops]
    # Fewer proxies than expected (e.g. local/dev direct access) — use the immediate peer.
    return request.client.host if request.client else "unknown"


def _sweep(now: float):
    """Drop keys whose most recent hit is old, so memory does not grow unbounded."""
    global _last_sweep
    if now - _last_sweep < _SWEEP_INTERVAL:
        return
    _last_sweep = now
    stale = [k for k, dq in _hits.items() if not dq or now - dq[-1] > _SWEEP_INTERVAL]
    for k in stale:
        del _hits[k]


def _check(key: str, rules: list[tuple[int, int]]) -> tuple[bool, int]:
    """Return (allowed, retry_after_seconds). `rules` is a list of (max_hits, window_secs)."""
    now = time.time()
    max_window = max(w for _, w in rules)
    with _lock:
        _sweep(now)
        dq = _hits[key]
        cutoff = now - max_window
        while dq and dq[0] <= cutoff:
            dq.popleft()
        for limit, window in rules:
            start = now - window
            in_window = [t for t in dq if t > start]
            if len(in_window) >= limit:
                retry = int(in_window[0] + window - now) + 1
                return False, max(1, retry)
        dq.append(now)
        return True, 0


def rate_limit(bucket: str, rules: list[tuple[int, int]]):
    """Build a FastAPI dependency enforcing `rules` per client IP for this `bucket`.

    Multiple rules are ANDed, e.g. [(5, 60), (30, 3600)] means "at most 5 per minute AND
    30 per hour". Buckets are independent, so limits on different endpoint groups don't
    interfere with one another.
    """
    async def dependency(request: Request):
        if not settings.RATE_LIMIT_ENABLED:
            return
        key = f"{bucket}:{get_client_ip(request)}"
        allowed, retry_after = _check(key, rules)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please slow down and try again in a moment.",
                headers={"Retry-After": str(retry_after)},
            )

    return dependency
