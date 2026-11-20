"""In-process async pub/sub broadcaster used for Server-Sent Events.

``publish`` is safe to call from any thread (sync FastAPI endpoints run in a
thread pool, the simulator scores in worker threads).
"""
from __future__ import annotations

import asyncio
import threading
from collections import deque
from datetime import datetime
from typing import Any

from app.core.jsonsafe import json_safe


class EventBroker:
    def __init__(self, maxsize: int = 1000) -> None:
        self._subs: set[asyncio.Queue] = set()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._lock = threading.Lock()
        self._maxsize = maxsize
        self.recent: deque[dict] = deque(maxlen=50)

    def bind_loop(self, loop: asyncio.AbstractEventLoop | None = None) -> None:
        self._loop = loop or asyncio.get_running_loop()

    def subscribe(self) -> asyncio.Queue:
        if self._loop is None:
            try:
                self._loop = asyncio.get_running_loop()
            except RuntimeError:
                pass
        q: asyncio.Queue = asyncio.Queue(maxsize=self._maxsize)
        with self._lock:
            self._subs.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        with self._lock:
            self._subs.discard(q)

    @property
    def subscriber_count(self) -> int:
        return len(self._subs)

    @staticmethod
    def _put(q: asyncio.Queue, evt: dict) -> None:
        try:
            q.put_nowait(evt)
        except asyncio.QueueFull:
            pass

    def publish(self, type_: str, data: Any) -> None:
        evt = {"type": type_, "data": json_safe(data), "at": datetime.now().isoformat()}
        self.recent.append(evt)
        with self._lock:
            subs = list(self._subs)
        if not subs:
            return
        loop = self._loop
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        for q in subs:
            if loop is None or running is loop:
                self._put(q, evt)
            elif not loop.is_closed():
                try:
                    loop.call_soon_threadsafe(self._put, q, evt)
                except RuntimeError:
                    pass


broker = EventBroker()
