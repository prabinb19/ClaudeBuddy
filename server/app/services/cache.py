"""TTL-based caching service."""

import time
from typing import Any, Optional
from dataclasses import dataclass, field


@dataclass
class CacheEntry:
    """A single cache entry with TTL."""
    data: Any
    timestamp: float
    ttl: int  # TTL in seconds


class Cache:
    """Simple in-memory cache with TTL support."""
    
    def __init__(self):
        self._cache: dict[str, CacheEntry] = {}
    
    def get(self, key: str) -> Optional[Any]:
        """Get cached data if not expired."""
        entry = self._cache.get(key)
        if entry is None:
            return None
        
        if time.time() - entry.timestamp > entry.ttl:
            # Expired
            del self._cache[key]
            return None
        
        return entry.data
    
    def set(self, key: str, data: Any, ttl: int) -> None:
        """Set cache data with TTL in seconds."""
        self._cache[key] = CacheEntry(
            data=data,
            timestamp=time.time(),
            ttl=ttl
        )
    
    def invalidate(self, key: str) -> None:
        """Invalidate a cache entry."""
        if key in self._cache:
            del self._cache[key]
    
    def clear(self) -> None:
        """Clear all cache entries."""
        self._cache.clear()


# Global cache instance
cache = Cache()
