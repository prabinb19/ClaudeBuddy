"""Insights endpoints - Daily summaries, error patterns, tasks."""

import re
from typing import Optional
from datetime import datetime, timedelta
from collections import defaultdict
from fastapi import APIRouter, Query

from ..services.claude_reader import claude_reader
from ..services.cache import cache
from ..config import get_settings

router = APIRouter(tags=["insights"])


async def extract_all_sessions() -> list[dict]:
    """Extract all sessions with their operations."""
    settings = get_settings()
    projects_dir = settings.projects_dir
    
    if not projects_dir.exists():
        return []
    
    sessions = []
    
    for project_dir in projects_dir.iterdir():
        if not project_dir.is_dir():
            continue
        
        session_files = [f for f in project_dir.iterdir() if f.suffix == ".jsonl"]
        
        for session_file in session_files:
            raw_messages = await claude_reader.parse_jsonl(session_file)
            
            operations = []
            start_time = None
            end_time = None
            
            for msg in raw_messages:
                timestamp = msg.get("timestamp")
                if timestamp:
                    if not start_time or timestamp < start_time:
                        start_time = timestamp
                    if not end_time or timestamp > end_time:
                        end_time = timestamp
                
                if msg.get("type") == "assistant" or msg.get("message", {}).get("role") == "assistant":
                    tool_calls = claude_reader.extract_tool_calls(msg.get("message"))
                    
                    for tool in tool_calls:
                        name = tool.get("name", "").lower()
                        input_data = tool.get("input", {})
                        
                        op = {"type": name, "timestamp": timestamp}
                        
                        if name == "write":
                            op["filePath"] = input_data.get("file_path")
                            op["content"] = input_data.get("content")
                        elif name == "edit":
                            op["filePath"] = input_data.get("file_path")
                            op["oldString"] = input_data.get("old_string")
                            op["newString"] = input_data.get("new_string")
                        elif name == "read":
                            op["filePath"] = input_data.get("file_path")
                        elif name == "bash":
                            op["command"] = input_data.get("command")
                        elif name == "glob":
                            op["pattern"] = input_data.get("pattern")
                        elif name == "grep":
                            op["pattern"] = input_data.get("pattern")
                        
                        operations.append(op)
            
            if start_time:
                sessions.append({
                    "id": session_file.stem,
                    "project": project_dir.name,
                    "date": start_time.split("T")[0] if "T" in start_time else start_time[:10],
                    "startTime": start_time,
                    "endTime": end_time,
                    "operations": operations,
                })
    
    return sessions


def extract_user_messages(raw_messages: list[dict]) -> list[dict]:
    """Extract user messages from raw session messages."""
    messages = []
    for msg in raw_messages:
        if msg.get("type") == "user" or msg.get("message", {}).get("role") == "user":
            content = msg.get("message", {}).get("content")
            if isinstance(content, str):
                text = content
            elif isinstance(content, list) and content:
                text = content[0].get("text", "")
            else:
                text = ""
            
            if text:
                messages.append({
                    "text": text,
                    "timestamp": msg.get("timestamp"),
                    "firstLine": text.split("\n")[0][:60],
                })
    
    return messages


@router.get("/insights/daily")
async def get_daily_insights(
    date: Optional[str] = Query(None),
    refresh: Optional[str] = Query(None),
):
    """Get daily summary for a specific date."""
    settings = get_settings()
    target_date = date or datetime.now().strftime("%Y-%m-%d")
    
    # Format display date
    date_obj = datetime.strptime(target_date, "%Y-%m-%d")
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday = today - timedelta(days=1)
    
    if target_date == today.strftime("%Y-%m-%d"):
        display_date = f"Today ({date_obj.strftime('%b %d')})"
    elif target_date == yesterday.strftime("%Y-%m-%d"):
        display_date = f"Yesterday ({date_obj.strftime('%b %d')})"
    else:
        display_date = date_obj.strftime("%a, %b %d")
    
    # Get all sessions
    all_sessions = await extract_all_sessions()
    day_sessions = [s for s in all_sessions if s["date"] == target_date]
    
    # Compute summary
    files_modified = set()
    operation_counts = {"writes": 0, "edits": 0, "bash": 0, "total": 0}
    total_active_minutes = 0
    topics = []
    
    for session in day_sessions:
        # Calculate session duration
        if session.get("startTime") and session.get("endTime"):
            try:
                start = datetime.fromisoformat(session["startTime"].replace("Z", "+00:00"))
                end = datetime.fromisoformat(session["endTime"].replace("Z", "+00:00"))
                duration = (end - start).total_seconds() / 60
                total_active_minutes += min(duration, 180)  # Cap at 3 hours
            except (ValueError, TypeError):
                pass
        
        # Count operations and files
        current_topic = None
        current_ops = []
        current_files = set()
        
        for op in session.get("operations", []):
            op_type = op.get("type")
            
            if op_type == "write":
                operation_counts["writes"] += 1
                operation_counts["total"] += 1
                if op.get("filePath"):
                    files_modified.add(op["filePath"].split("/")[-1])
                    current_files.add(op["filePath"].split("/")[-1])
                current_ops.append("write")
            elif op_type == "edit":
                operation_counts["edits"] += 1
                operation_counts["total"] += 1
                if op.get("filePath"):
                    files_modified.add(op["filePath"].split("/")[-1])
                    current_files.add(op["filePath"].split("/")[-1])
                current_ops.append("edit")
            elif op_type == "bash":
                operation_counts["bash"] += 1
                operation_counts["total"] += 1
                current_ops.append("bash")
        
        if current_ops:
            topics.append({
                "topic": f"Session {session['id'][:8]}",
                "operationCount": len(current_ops),
                "filesInvolved": list(current_files),
            })
    
    # Get available dates for navigation
    all_dates = sorted(set(s["date"] for s in all_sessions))
    current_index = all_dates.index(target_date) if target_date in all_dates else -1
    
    return {
        "date": target_date,
        "displayDate": display_date,
        "summary": {
            "sessionCount": len(day_sessions),
            "activeMinutes": round(total_active_minutes),
            "filesModified": list(files_modified),
            "operationCounts": operation_counts,
            "topics": topics[:10],
        },
        "navigation": {
            "hasPrevious": current_index > 0 or (current_index == -1 and len(all_dates) > 0),
            "previousDate": all_dates[current_index - 1] if current_index > 0 else (all_dates[-1] if all_dates else None),
            "hasNext": 0 <= current_index < len(all_dates) - 1,
            "nextDate": all_dates[current_index + 1] if 0 <= current_index < len(all_dates) - 1 else None,
        },
    }


@router.get("/insights/errors")
async def get_error_patterns(
    days: int = Query(7, ge=1, le=90),
    refresh: Optional[str] = Query(None),
):
    """Get error patterns from recent sessions."""
    settings = get_settings()
    cache_key = f"insights_errors_{days}"
    
    if refresh != "1":
        cached = cache.get(cache_key)
        if cached:
            return cached
    
    cutoff_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    
    all_sessions = await extract_all_sessions()
    recent_sessions = [s for s in all_sessions if s["date"] >= cutoff_date]
    
    # Detect struggle files (5+ edits on same file in one session)
    struggle_files = []
    for session in recent_sessions:
        file_edit_counts = defaultdict(lambda: {"count": 0, "path": ""})
        
        for op in session.get("operations", []):
            if op.get("type") == "edit" and op.get("filePath"):
                file_name = op["filePath"].split("/")[-1]
                file_edit_counts[file_name]["count"] += 1
                file_edit_counts[file_name]["path"] = op["filePath"]
        
        for file_name, data in file_edit_counts.items():
            if data["count"] >= 5:
                severity = "high" if data["count"] >= 10 else "medium" if data["count"] >= 7 else "low"
                struggle_files.append({
                    "fileName": file_name,
                    "filePath": data["path"],
                    "editCount": data["count"],
                    "severity": severity,
                    "date": session["date"],
                    "sessionId": session["id"],
                })
    
    struggle_files.sort(key=lambda x: x["editCount"], reverse=True)
    
    # Detect repeated consecutive commands
    repeated_commands = []
    for session in recent_sessions:
        bash_ops = [op for op in session.get("operations", []) if op.get("type") == "bash" and op.get("command")]
        
        current_cmd = None
        count = 0
        
        for op in bash_ops:
            cmd = op["command"].split()[0] if op["command"] else ""
            if cmd == current_cmd:
                count += 1
            else:
                if count >= 3 and current_cmd:
                    repeated_commands.append({
                        "command": current_cmd,
                        "occurrences": count,
                        "note": f"Ran {count} times in succession",
                        "date": session["date"],
                    })
                current_cmd = cmd
                count = 1
        
        if count >= 3 and current_cmd:
            repeated_commands.append({
                "command": current_cmd,
                "occurrences": count,
                "note": f"Ran {count} times in succession",
                "date": session["date"],
            })
    
    repeated_commands.sort(key=lambda x: x["occurrences"], reverse=True)
    
    # Detect thrashing sessions
    thrashing_sessions = []
    for session in recent_sessions:
        if not session.get("startTime") or not session.get("endTime"):
            continue
        
        try:
            start = datetime.fromisoformat(session["startTime"].replace("Z", "+00:00"))
            end = datetime.fromisoformat(session["endTime"].replace("Z", "+00:00"))
            duration = (end - start).total_seconds() / 60
        except (ValueError, TypeError):
            continue
        
        code_ops = [op for op in session.get("operations", []) if op.get("type") in ("write", "edit")]
        unique_files = set(op.get("filePath") for op in code_ops if op.get("filePath"))
        
        if len(code_ops) >= 20 and len(unique_files) <= 3 and duration < 30:
            thrashing_sessions.append({
                "operationCount": len(code_ops),
                "uniqueFilesCount": len(unique_files),
                "duration": round(duration),
                "date": session["date"],
                "sessionId": session["id"],
                "files": [f.split("/")[-1] if f else "" for f in unique_files],
            })
    
    result = {
        "period": f"Last {days} days",
        "patterns": {
            "struggleFiles": struggle_files[:20],
            "repeatedCommands": repeated_commands[:10],
            "errorMentions": [],  # Would require parsing user messages
            "thrashingSessions": thrashing_sessions[:10],
        },
    }
    
    cache.set(cache_key, result, settings.insights_cache_ttl)
    
    return result


@router.get("/insights/tasks")
async def get_task_insights(
    days: int = Query(30, ge=1, le=90),
    refresh: Optional[str] = Query(None),
):
    """Get time-on-task analysis."""
    settings = get_settings()
    cache_key = f"insights_tasks_{days}"
    
    if refresh != "1":
        cached = cache.get(cache_key)
        if cached:
            return cached
    
    cutoff_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    
    all_sessions = await extract_all_sessions()
    recent_sessions = [s for s in all_sessions if s["date"] >= cutoff_date]
    
    # Simple task grouping - group by date and project
    tasks = []
    grouped = defaultdict(list)
    
    for session in recent_sessions:
        key = (session["date"], session["project"])
        grouped[key].append(session)
    
    for (date, project), sessions in grouped.items():
        total_minutes = 0
        all_files = set()
        
        for session in sessions:
            if session.get("startTime") and session.get("endTime"):
                try:
                    start = datetime.fromisoformat(session["startTime"].replace("Z", "+00:00"))
                    end = datetime.fromisoformat(session["endTime"].replace("Z", "+00:00"))
                    total_minutes += (end - start).total_seconds() / 60
                except (ValueError, TypeError):
                    pass
            
            for op in session.get("operations", []):
                if op.get("filePath"):
                    all_files.add(op["filePath"].split("/")[-1])
        
        project_name = project.replace("-", "/").split("/")[-1]
        
        tasks.append({
            "id": f"task-{date}-{project[:8]}",
            "name": f"Work on {project_name}",
            "inferredFrom": "project",
            "sessionCount": len(sessions),
            "totalMinutes": round(total_minutes),
            "filesInvolved": list(all_files),
            "dateRange": {"start": date, "end": date},
        })
    
    tasks.sort(key=lambda t: t["dateRange"]["start"], reverse=True)
    
    total_time_minutes = sum(t["totalMinutes"] for t in tasks)
    avg_minutes_per_task = round(total_time_minutes / len(tasks)) if tasks else 0
    
    result = {
        "period": f"Last {days} days",
        "tasks": tasks[:50],
        "summary": {
            "totalTasks": len(tasks),
            "totalTimeMinutes": total_time_minutes,
            "avgMinutesPerTask": avg_minutes_per_task,
        },
    }
    
    cache.set(cache_key, result, settings.insights_cache_ttl)
    
    return result


@router.get("/productivity")
async def get_productivity_metrics(refresh: Optional[str] = Query(None)):
    """Get productivity metrics."""
    settings = get_settings()
    cache_key = "productivity"
    
    if refresh != "1":
        cached = cache.get(cache_key)
        if cached:
            return cached
    
    if not claude_reader.data_exists():
        return {
            "velocity": {
                "filesModifiedByDay": [],
                "linesChangedEstimate": 0,
                "totalCodeOperations": 0,
                "averageOpsPerDay": 0,
            },
            "efficiency": {
                "peakHoursHeatmap": [[0] * 24 for _ in range(7)],
                "sessionDurations": {},
                "opsPerSession": 0,
                "tokensPerCodeOp": 0,
            },
            "patterns": {
                "productivityByDayOfWeek": [],
                "currentStreak": 0,
                "longestStreak": 0,
                "focusSessions": 0,
                "mostEditedFiles": [],
            },
            "toolUsage": {
                "distribution": {},
                "readWriteRatio": 0,
                "ratioInsight": "",
                "trends": [],
            },
            "summary": {
                "totalActiveDays": 0,
                "mostProductiveDay": "N/A",
                "mostProductiveHour": "N/A",
            },
            "computedAt": datetime.utcnow().isoformat(),
            "message": "No Claude Code data found.",
        }
    
    all_sessions = await extract_all_sessions()
    
    # Velocity metrics
    files_by_day = defaultdict(set)
    total_writes = 0
    total_edits = 0
    total_lines = 0
    ops_by_day = defaultdict(lambda: {"writes": 0, "edits": 0})
    
    for session in all_sessions:
        date = session["date"]
        for op in session.get("operations", []):
            if op.get("type") == "write":
                total_writes += 1
                ops_by_day[date]["writes"] += 1
                if op.get("filePath"):
                    files_by_day[date].add(op["filePath"])
                if op.get("content"):
                    total_lines += op["content"].count("\n") + 1
            elif op.get("type") == "edit":
                total_edits += 1
                ops_by_day[date]["edits"] += 1
                if op.get("filePath"):
                    files_by_day[date].add(op["filePath"])
    
    files_per_day = [
        {"date": date, "count": len(files)}
        for date, files in sorted(files_by_day.items())
    ]
    
    total_code_ops = total_writes + total_edits
    active_days = len(ops_by_day)
    avg_ops_per_day = round(total_code_ops / active_days, 1) if active_days > 0 else 0
    
    # Peak hours heatmap
    heatmap = [[0] * 24 for _ in range(7)]
    for session in all_sessions:
        for op in session.get("operations", []):
            if op.get("timestamp"):
                try:
                    dt = datetime.fromisoformat(op["timestamp"].replace("Z", "+00:00"))
                    heatmap[dt.weekday()][dt.hour] += 1
                except (ValueError, TypeError):
                    pass
    
    # Find most productive hour
    hour_totals = [sum(heatmap[day][hour] for day in range(7)) for hour in range(24)]
    most_productive_hour = hour_totals.index(max(hour_totals)) if hour_totals else 0
    
    # Tool usage distribution
    tool_distribution = defaultdict(int)
    for session in all_sessions:
        for op in session.get("operations", []):
            tool_name = op.get("type", "").capitalize()
            if tool_name:
                tool_distribution[tool_name] += 1
    
    result = {
        "velocity": {
            "filesModifiedByDay": files_per_day[-30:],
            "linesChangedEstimate": total_lines,
            "totalCodeOperations": total_code_ops,
            "totalWrites": total_writes,
            "totalEdits": total_edits,
            "averageOpsPerDay": avg_ops_per_day,
        },
        "efficiency": {
            "peakHoursHeatmap": heatmap,
            "sessionDurations": {},
            "opsPerSession": round(total_code_ops / len(all_sessions), 1) if all_sessions else 0,
        },
        "patterns": {
            "productivityByDayOfWeek": [],
            "currentStreak": 0,
            "longestStreak": 0,
            "focusSessions": 0,
            "mostEditedFiles": [],
            "totalActiveDays": active_days,
        },
        "toolUsage": {
            "distribution": dict(tool_distribution),
        },
        "summary": {
            "totalActiveDays": active_days,
            "mostProductiveDay": "N/A",
            "mostProductiveHour": f"{most_productive_hour}:00",
        },
        "computedAt": datetime.utcnow().isoformat(),
    }
    
    cache.set(cache_key, result, settings.productivity_cache_ttl)
    
    return result


@router.get("/help")
async def get_help():
    """Get FAQ/Help content."""
    return {
        "shortcuts": [
            {"key": "Ctrl+C", "description": "Cancel current operation"},
            {"key": "Ctrl+D", "description": "Exit Claude Code"},
            {"key": "/help", "description": "Show help"},
            {"key": "/clear", "description": "Clear conversation"},
            {"key": "/compact", "description": "Compact conversation history"},
            {"key": "/config", "description": "Open configuration"},
            {"key": "/cost", "description": "Show token usage and cost"},
            {"key": "/doctor", "description": "Check system health"},
            {"key": "/init", "description": "Initialize project with CLAUDE.md"},
            {"key": "/memory", "description": "Edit memory files"},
            {"key": "/model", "description": "Switch model"},
            {"key": "/permissions", "description": "Manage permissions"},
            {"key": "/review", "description": "Review code changes"},
            {"key": "/terminal-setup", "description": "Setup terminal integration"},
        ],
        "tips": [
            "Use @filename to reference specific files in your prompts",
            "Create a CLAUDE.md file in your project root for persistent instructions",
            "Use /compact to reduce context when conversations get long",
            "Set up MCP servers to give Claude access to external tools",
            "Use hooks to run commands automatically on certain events",
        ],
        "links": [
            {"title": "Documentation", "url": "https://docs.anthropic.com/claude-code"},
            {"title": "GitHub Issues", "url": "https://github.com/anthropics/claude-code/issues"},
            {"title": "MCP Servers", "url": "https://github.com/modelcontextprotocol/servers"},
        ],
    }
