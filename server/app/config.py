"""Configuration settings for ClaudeBuddy server."""

import os
from pathlib import Path
from functools import lru_cache
from pydantic_settings import BaseSettings


def _find_env_file() -> str:
    """Find .env file - check current dir, then parent (ClaudeBuddy root)."""
    current = Path.cwd()
    
    # Check current directory
    if (current / ".env").exists():
        return str(current / ".env")
    
    # Check parent directory (when running from server/)
    if (current.parent / ".env").exists():
        return str(current.parent / ".env")
    
    # Check two levels up (when running from server/app/)
    if (current.parent.parent / ".env").exists():
        return str(current.parent.parent / ".env")
    
    # Default to current directory
    return ".env"


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Server settings
    port: int = 3456
    host: str = "0.0.0.0"
    debug: bool = False
    
    # Claude directory (auto-detected)
    claude_data_dir: str = ""
    
    # API Keys for Supervisor Agent
    anthropic_api_key: str = ""
    tavily_api_key: str = ""
    
    # Supervisor Agent settings
    max_searches: int = 10
    default_model: str = "claude-sonnet-4-20250514"
    
    # Cache TTLs (in seconds)
    mcp_cache_ttl: int = 1800  # 30 minutes
    insights_cache_ttl: int = 300  # 5 minutes
    productivity_cache_ttl: int = 300  # 5 minutes
    agents_cache_ttl: int = 1800  # 30 minutes
    
    class Config:
        env_file = _find_env_file()
        env_file_encoding = "utf-8"
        extra = "ignore"
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Auto-detect Claude directory if not set
        if not self.claude_data_dir:
            self.claude_data_dir = self._detect_claude_dir()
    
    def _detect_claude_dir(self) -> str:
        """Cross-platform Claude directory detection."""
        home_dir = Path.home()
        
        # Standard location for all platforms
        standard_path = home_dir / ".claude"
        if standard_path.exists():
            return str(standard_path)
        
        # Windows alternative locations
        if os.name == "nt":
            appdata = os.environ.get("APPDATA", "")
            if appdata:
                appdata_path = Path(appdata) / "claude"
                if appdata_path.exists():
                    return str(appdata_path)
            
            localappdata = os.environ.get("LOCALAPPDATA", "")
            if localappdata:
                localappdata_path = Path(localappdata) / "claude"
                if localappdata_path.exists():
                    return str(localappdata_path)
        
        # Return standard path even if it doesn't exist
        return str(standard_path)
    
    @property
    def claude_dir(self) -> Path:
        """Get Claude directory as Path object."""
        return Path(self.claude_data_dir)
    
    @property
    def projects_dir(self) -> Path:
        """Get projects directory path."""
        return self.claude_dir / "projects"
    
    @property
    def stats_cache_path(self) -> Path:
        """Get stats cache file path."""
        return self.claude_dir / "stats-cache.json"
    
    @property
    def history_path(self) -> Path:
        """Get history file path."""
        return self.claude_dir / "history.jsonl"
    
    @property
    def config_path(self) -> Path:
        """Get Claude config file path."""
        return self.claude_dir / ".claude.json"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
