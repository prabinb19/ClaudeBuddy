"""Configuration settings for ClaudeBuddy server."""

import os
from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Server settings
    host: str = "0.0.0.0"
    port: int = 8765
    debug: bool = False

    # API Keys
    anthropic_api_key: Optional[str] = None
    tavily_api_key: Optional[str] = None

    # Model settings
    default_model: str = "claude-sonnet-4-20250514"

    # Cache TTL settings (in seconds)
    mcp_cache_ttl: int = 300  # 5 minutes
    insights_cache_ttl: int = 300  # 5 minutes
    productivity_cache_ttl: int = 300  # 5 minutes
    agents_cache_ttl: int = 300  # 5 minutes
    team_cache_ttl: int = 300  # 5 minutes

    @property
    def claude_dir(self) -> Path:
        """Get the Claude Code data directory."""
        return Path.home() / ".claude"

    @property
    def projects_dir(self) -> Path:
        """Get the projects directory inside Claude data."""
        return self.claude_dir / "projects"

    @property
    def history_path(self) -> Path:
        """Get the path to the history file."""
        return self.claude_dir / "history.jsonl"

    @property
    def stats_cache_path(self) -> Path:
        """Get the path to the stats cache file."""
        return self.claude_dir / "statsCache.json"

    @property
    def config_path(self) -> Path:
        """Get the path to the Claude config file."""
        return self.claude_dir / "config.json"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
