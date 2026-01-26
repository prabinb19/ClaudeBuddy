"""Stats and health check endpoints."""

import platform
import sys
from fastapi import APIRouter

from ..config import get_settings
from ..services.claude_reader import claude_reader
from ..services.cost_calculator import CostCalculator

router = APIRouter(tags=["stats"])


@router.get("/health")
async def health_check():
    """Health check and status endpoint."""
    settings = get_settings()
    has_data = claude_reader.data_exists()
    
    return {
        "status": "ok",
        "version": "2.0.0",
        "claudeDir": str(settings.claude_dir),
        "hasClaudeData": has_data,
        "platform": platform.system().lower(),
        "pythonVersion": sys.version,
    }


@router.get("/stats")
async def get_stats():
    """Get usage statistics."""
    if not claude_reader.data_exists():
        return {
            "stats": {
                "totalSessions": 0,
                "modelUsage": {},
                "dailyActivity": [],
            },
            "costs": {"total": 0, "byModel": {}},
            "charts": {"dailyActivity": [], "dailyTokens": []},
            "message": "No Claude Code data found. Start using Claude Code to see your stats here!",
        }
    
    data = await claude_reader.get_stats()
    stats = data.get("stats", {})
    
    # Calculate costs per model
    model_usage = stats.get("modelUsage", {})
    costs = CostCalculator.calculate_model_costs(model_usage)
    
    # Process daily activity for charts
    daily_activity = stats.get("dailyActivity", [])
    daily_stats = [
        {
            "date": day.get("date"),
            "messages": day.get("messageCount", 0),
            "sessions": day.get("sessionCount", 0),
            "toolCalls": day.get("toolCallCount", 0),
        }
        for day in daily_activity
    ]
    
    # Process daily token usage
    daily_model_tokens = stats.get("dailyModelTokens", [])
    daily_tokens = []
    for day in daily_model_tokens:
        tokens_by_model = day.get("tokensByModel", {})
        total_tokens = sum(tokens_by_model.values()) if tokens_by_model else 0
        daily_tokens.append({"date": day.get("date"), "tokens": total_tokens})
    
    return {
        "stats": stats,
        "startupCount": data.get("startupCount", 0),
        "theme": data.get("theme", "dark"),
        "autoUpdates": data.get("autoUpdates", True),
        "costs": costs,
        "charts": {
            "dailyActivity": daily_stats,
            "dailyTokens": daily_tokens,
        },
    }
