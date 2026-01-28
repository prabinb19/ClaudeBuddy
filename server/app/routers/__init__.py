"""API Routers for ClaudeBuddy."""

from .stats import router as stats_router
from .history import router as history_router
from .projects import router as projects_router
from .mcp import router as mcp_router
from .agents import router as agents_router
from .insights import router as insights_router
from .research import router as research_router
from .team import router as team_router

__all__ = [
    "stats_router",
    "history_router",
    "projects_router",
    "mcp_router",
    "agents_router",
    "insights_router",
    "research_router",
    "team_router",
]
