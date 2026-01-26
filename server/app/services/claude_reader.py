"""Service for reading Claude Code data from ~/.claude directory."""

import json
import re
from pathlib import Path
from typing import Any, Optional
from datetime import datetime

from ..config import get_settings


# Language detection from file extension
LANGUAGE_MAP = {
    ".js": "javascript",
    ".jsx": "jsx",
    ".ts": "typescript",
    ".tsx": "tsx",
    ".py": "python",
    ".rb": "ruby",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".c": "c",
    ".cpp": "cpp",
    ".h": "c",
    ".css": "css",
    ".scss": "scss",
    ".html": "html",
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".md": "markdown",
    ".sh": "bash",
    ".sql": "sql",
    ".xml": "xml",
}

# Topic detection keywords
TOPIC_KEYWORDS = {
    "Bug Fix": re.compile(r"\b(fix|bug|error|issue|broken|crash|fail)", re.I),
    "New Feature": re.compile(r"\b(add|create|implement|build|new feature|feature)", re.I),
    "Refactoring": re.compile(r"\b(refactor|clean|reorganize|restructure|improve)", re.I),
    "Testing": re.compile(r"\b(test|spec|coverage|jest|pytest|unittest)", re.I),
    "Documentation": re.compile(r"\b(doc|readme|comment|jsdoc|explain)", re.I),
    "Styling": re.compile(r"\b(css|style|design|ui|layout|theme)", re.I),
    "API Work": re.compile(r"\b(api|endpoint|route|rest|graphql|fetch)", re.I),
    "Database": re.compile(r"\b(database|db|sql|mongo|postgres|query|migration)", re.I),
    "DevOps": re.compile(r"\b(deploy|docker|ci|cd|build|pipeline|kubernetes)", re.I),
    "Security": re.compile(r"\b(auth|security|permission|token|encrypt)", re.I),
    "Performance": re.compile(r"\b(optimize|performance|speed|cache|lazy)", re.I),
}

# Technology detection keywords
TECH_KEYWORDS = {
    "React": re.compile(r"\breact\b", re.I),
    "Node.js": re.compile(r"\b(node|express|npm)\b", re.I),
    "TypeScript": re.compile(r"\btypescript|\.tsx?\b", re.I),
    "Python": re.compile(r"\b(python|pip|django|flask)\b", re.I),
    "SQL": re.compile(r"\b(sql|postgres|mysql|sqlite)\b", re.I),
    "Docker": re.compile(r"\bdocker\b", re.I),
    "Git": re.compile(r"\b(git|commit|branch|merge|pr)\b", re.I),
    "CSS": re.compile(r"\b(css|scss|tailwind|styled)", re.I),
    "Testing": re.compile(r"\b(jest|pytest|test|spec)\b", re.I),
}


class ClaudeReader:
    """Read and parse Claude Code data from local filesystem."""
    
    def __init__(self):
        self.settings = get_settings()
    
    @property
    def claude_dir(self) -> Path:
        return self.settings.claude_dir
    
    @property
    def projects_dir(self) -> Path:
        return self.settings.projects_dir
    
    def _decode_project_path(self, encoded_name: str) -> str:
        """Decode Claude project directory name back to actual filesystem path.
        
        Claude encodes paths by replacing '/' with '-', but original hyphens
        and dots in directory names are also preserved as '-'. We need to 
        reconstruct by checking which paths actually exist on the filesystem.
        
        Example: '-Users-prabinbajgai-Documents-GitHub-auto-pusher' 
                 -> '/Users/prabinbajgai/Documents/GitHub/auto-pusher'
        Example: '-Users-prabinbajgai-Documents-GitHub-prabinb19-github-io'
                 -> '/Users/prabinbajgai/Documents/GitHub/prabinb19.github.io'
        """
        # Remove leading hyphen and split
        if encoded_name.startswith("-"):
            encoded_name = encoded_name[1:]
        
        parts = encoded_name.split("-")
        
        # Build path by checking filesystem
        # Start with root
        current_path = Path("/")
        result_parts = []
        
        i = 0
        while i < len(parts):
            # Try progressively longer combinations with different separators
            found = False
            
            # Try from longest possible to shortest
            for j in range(len(parts), i, -1):
                segment_parts = parts[i:j]
                
                # Try different separator combinations for multi-part segments
                # For simplicity, try common patterns: all-hyphens, all-dots, mixed
                candidates = []
                
                if len(segment_parts) == 1:
                    candidates = [segment_parts[0]]
                else:
                    # Try hyphen-joined
                    candidates.append("-".join(segment_parts))
                    # Try dot-joined (common for domains like github.io)
                    candidates.append(".".join(segment_parts))
                    # Try underscore-joined (common in some projects)
                    candidates.append("_".join(segment_parts))
                
                for candidate in candidates:
                    test_path = current_path / candidate
                    if test_path.exists():
                        result_parts.append(candidate)
                        current_path = test_path
                        i = j
                        found = True
                        break
                
                if found:
                    break
            
            if not found:
                # If nothing exists, just use the single part
                # This handles the case where the directory doesn't exist anymore
                result_parts.append(parts[i])
                current_path = current_path / parts[i]
                i += 1
        
        return "/" + "/".join(result_parts)
    
    def data_exists(self) -> bool:
        """Check if Claude Code data exists."""
        return self.claude_dir.exists() and self.projects_dir.exists()
    
    async def parse_jsonl(self, file_path: Path) -> list[dict]:
        """Parse a JSONL file and return list of objects."""
        results = []
        if not file_path.exists():
            return results
        
        with open(file_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        results.append(json.loads(line))
                    except json.JSONDecodeError:
                        # Skip malformed lines
                        pass
        
        return results
    
    def read_json(self, file_path: Path) -> Optional[dict]:
        """Read a JSON file."""
        if not file_path.exists():
            return None
        
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    
    @staticmethod
    def extract_content(message: Optional[dict]) -> str:
        """Extract text content from message (handles both string and array formats)."""
        if not message:
            return ""
        
        content = message.get("content")
        
        # String content (user messages)
        if isinstance(content, str):
            return content
        
        # Array content (assistant messages with thinking/text blocks)
        if isinstance(content, list):
            return "\n".join(
                block.get("text", "")
                for block in content
                if block.get("type") == "text"
            )
        
        return ""
    
    @staticmethod
    def extract_tool_calls(message: Optional[dict]) -> list[dict]:
        """Extract tool calls from message content."""
        if not message:
            return []
        
        content = message.get("content")
        if not isinstance(content, list):
            return []
        
        return [
            {
                "id": block.get("id"),
                "name": block.get("name"),
                "input": block.get("input", {}),
            }
            for block in content
            if block.get("type") == "tool_use"
        ]
    
    @staticmethod
    def get_language_from_path(file_path: Optional[str]) -> str:
        """Get language from file extension for syntax highlighting."""
        if not file_path:
            return "text"
        
        ext = Path(file_path).suffix.lower()
        return LANGUAGE_MAP.get(ext, "text")
    
    def extract_code_operations(self, raw_messages: list[dict]) -> list[dict]:
        """Extract code operations from session messages."""
        operations = []
        
        for msg in raw_messages:
            if msg.get("type") != "assistant" and msg.get("message", {}).get("role") != "assistant":
                continue
            
            tool_calls = self.extract_tool_calls(msg.get("message"))
            
            for tool in tool_calls:
                name = tool.get("name", "")
                input_data = tool.get("input", {})
                timestamp = msg.get("timestamp")
                
                if name == "Write":
                    operations.append({
                        "type": "write",
                        "timestamp": timestamp,
                        "filePath": input_data.get("file_path"),
                        "content": input_data.get("content"),
                        "language": self.get_language_from_path(input_data.get("file_path")),
                    })
                elif name == "Edit":
                    operations.append({
                        "type": "edit",
                        "timestamp": timestamp,
                        "filePath": input_data.get("file_path"),
                        "oldString": input_data.get("old_string"),
                        "newString": input_data.get("new_string"),
                        "language": self.get_language_from_path(input_data.get("file_path")),
                    })
                elif name == "Bash":
                    operations.append({
                        "type": "bash",
                        "timestamp": timestamp,
                        "command": input_data.get("command"),
                        "description": input_data.get("description"),
                    })
                elif name == "Read":
                    operations.append({
                        "type": "read",
                        "timestamp": timestamp,
                        "filePath": input_data.get("file_path"),
                    })
        
        return operations
    
    def detect_topics(self, content: str) -> list[str]:
        """Detect topics from content."""
        topics = []
        for topic, regex in TOPIC_KEYWORDS.items():
            if regex.search(content):
                topics.append(topic)
        return topics
    
    def detect_technologies(self, content: str) -> list[str]:
        """Detect technologies from content."""
        technologies = []
        for tech, regex in TECH_KEYWORDS.items():
            if regex.search(content):
                technologies.append(tech)
        return technologies
    
    async def analyze_session(self, session_path: Path) -> dict:
        """Analyze session content to extract insights."""
        messages = await self.parse_jsonl(session_path)
        
        insights = {
            "topics": [],
            "tasks": [],
            "technologies": [],
            "messageCount": 0,
            "firstTimestamp": None,
            "lastTimestamp": None,
        }
        
        seen_topics = set()
        seen_tech = set()
        task_patterns = []
        
        for msg in messages:
            timestamp = msg.get("timestamp")
            if timestamp:
                if not insights["firstTimestamp"] or timestamp < insights["firstTimestamp"]:
                    insights["firstTimestamp"] = timestamp
                if not insights["lastTimestamp"] or timestamp > insights["lastTimestamp"]:
                    insights["lastTimestamp"] = timestamp
            
            content = self.extract_content(msg.get("message"))
            if not content:
                continue
            
            insights["messageCount"] += 1
            
            # Detect topics
            for topic in self.detect_topics(content):
                if topic not in seen_topics:
                    seen_topics.add(topic)
                    insights["topics"].append(topic)
            
            # Detect technologies
            for tech in self.detect_technologies(content):
                if tech not in seen_tech:
                    seen_tech.add(tech)
                    insights["technologies"].append(tech)
            
            # Extract task-like phrases from user messages
            if msg.get("type") == "user" or msg.get("message", {}).get("role") == "user":
                action_match = re.match(
                    r"^(add|create|fix|update|implement|build|make|write|refactor|test|debug|deploy|setup|configure|install|remove|delete|change|modify)\s+.{10,60}",
                    content,
                    re.I,
                )
                if action_match and len(task_patterns) < 5:
                    task_patterns.append(action_match.group(0).strip())
        
        insights["tasks"] = task_patterns
        return insights
    
    async def get_all_projects(self) -> list[dict]:
        """Get all projects with insights."""
        if not self.projects_dir.exists():
            return []
        
        projects = []
        
        for project_dir in self.projects_dir.iterdir():
            if not project_dir.is_dir():
                continue
            
            # Get session files
            session_files = sorted(
                [f for f in project_dir.iterdir() if f.suffix == ".jsonl"],
                key=lambda f: f.stat().st_mtime,
                reverse=True,
            )
            
            # Decode project path from directory name
            decoded_path = self._decode_project_path(project_dir.name)
            project_name = decoded_path.split("/")[-1] or "Unknown"
            
            # Analyze recent sessions for insights
            all_topics = set()
            all_tech = set()
            all_tasks = []
            total_messages = 0
            latest_activity = None
            
            for session_file in session_files[:3]:  # Analyze up to 3 most recent
                insights = await self.analyze_session(session_file)
                all_topics.update(insights["topics"])
                all_tech.update(insights["technologies"])
                all_tasks.extend(insights["tasks"])
                total_messages += insights["messageCount"]
                
                if insights["lastTimestamp"]:
                    if not latest_activity or insights["lastTimestamp"] > latest_activity:
                        latest_activity = insights["lastTimestamp"]
            
            projects.append({
                "id": project_dir.name,
                "path": decoded_path,
                "name": project_name,
                "sessionCount": len(session_files),
                "lastModified": project_dir.stat().st_mtime,
                "lastActivity": latest_activity,
                "totalMessages": total_messages,
                "topics": list(all_topics)[:5],
                "technologies": list(all_tech)[:6],
                "recentTasks": all_tasks[:4],
                "sessions": [
                    {
                        "id": f.stem,
                        "file": f.name,
                        "lastModified": f.stat().st_mtime,
                    }
                    for f in session_files[:5]
                ],
            })
        
        # Sort by last activity
        projects.sort(
            key=lambda p: p.get("lastActivity") or p.get("lastModified") or 0,
            reverse=True,
        )
        
        return projects
    
    async def get_session(self, project_id: str, session_id: str) -> Optional[dict]:
        """Get session details."""
        session_path = self.projects_dir / project_id / f"{session_id}.jsonl"
        
        if not session_path.exists():
            return None
        
        raw_messages = await self.parse_jsonl(session_path)
        
        # Filter to user/assistant messages and extract content
        messages = []
        for msg in raw_messages:
            msg_type = msg.get("type")
            role = msg.get("message", {}).get("role")
            
            if msg_type in ("user", "assistant") or role in ("user", "assistant"):
                actual_role = "user" if msg_type == "user" or role == "user" else "assistant"
                content = self.extract_content(msg.get("message"))
                
                if content:
                    messages.append({
                        "role": actual_role,
                        "content": content[:2000],  # Limit content length
                        "timestamp": msg.get("timestamp"),
                        "model": msg.get("message", {}).get("model"),
                    })
        
        # Extract code operations
        code_operations = self.extract_code_operations(raw_messages)
        
        # Get session metadata
        first_msg = next((m for m in raw_messages if m.get("timestamp")), None)
        last_msg = next((m for m in reversed(raw_messages) if m.get("timestamp")), None)
        
        return {
            "id": session_id,
            "messageCount": len(messages),
            "startTime": first_msg.get("timestamp") if first_msg else None,
            "endTime": last_msg.get("timestamp") if last_msg else None,
            "messages": messages,
            "codeOperations": code_operations,
            "operationCounts": {
                "writes": len([op for op in code_operations if op["type"] == "write"]),
                "edits": len([op for op in code_operations if op["type"] == "edit"]),
                "commands": len([op for op in code_operations if op["type"] == "bash"]),
                "reads": len([op for op in code_operations if op["type"] == "read"]),
            },
        }
    
    def _parse_timestamp(self, timestamp) -> tuple[datetime, str]:
        """Parse timestamp that can be int (Unix ms) or string (ISO format).
        
        Returns (datetime_obj, iso_string).
        """
        if isinstance(timestamp, (int, float)):
            # Unix timestamp in milliseconds
            dt = datetime.fromtimestamp(timestamp / 1000)
            return dt, dt.isoformat()
        elif isinstance(timestamp, str):
            # ISO format string
            dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            return dt, timestamp
        else:
            raise ValueError(f"Unknown timestamp format: {type(timestamp)}")
    
    async def get_history(self) -> list[dict]:
        """Get command history grouped by date and session."""
        history = await self.parse_jsonl(self.settings.history_path)
        
        # Sort by timestamp descending (handle both int and string)
        def get_sort_key(x):
            ts = x.get("timestamp", 0)
            if isinstance(ts, (int, float)):
                return ts
            elif isinstance(ts, str):
                try:
                    return datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp() * 1000
                except:
                    return 0
            return 0
        
        history.sort(key=get_sort_key, reverse=True)
        
        # Group by date, then by session
        grouped = {}
        
        for item in history:
            timestamp = item.get("timestamp")
            if not timestamp:
                continue
            
            try:
                dt, ts_str = self._parse_timestamp(timestamp)
                date = dt.strftime("%a, %b %d, %Y")
            except (ValueError, TypeError):
                continue
            
            if date not in grouped:
                grouped[date] = {"date": date, "sessions": {}}
            
            session_id = item.get("sessionId", "unknown")
            if session_id not in grouped[date]["sessions"]:
                project = item.get("project", "")
                project_name = project.split("/")[-1] if project else "Unknown Project"
                
                grouped[date]["sessions"][session_id] = {
                    "sessionId": session_id,
                    "project": project,
                    "projectName": project_name,
                    "prompts": [],
                    "firstTimestamp": ts_str,
                    "lastTimestamp": ts_str,
                    "_firstDt": dt,
                    "_lastDt": dt,
                }
            
            session = grouped[date]["sessions"][session_id]
            session["prompts"].append({
                "text": item.get("display", ""),
                "timestamp": ts_str,
            })
            
            if dt < session["_firstDt"]:
                session["firstTimestamp"] = ts_str
                session["_firstDt"] = dt
            if dt > session["_lastDt"]:
                session["lastTimestamp"] = ts_str
                session["_lastDt"] = dt
        
        # Convert to array format and generate summaries
        result = []
        for day_group in grouped.values():
            sessions = []
            for session in day_group["sessions"].values():
                # Generate topic summary
                all_text = " ".join(p["text"] for p in session["prompts"]).lower()
                topic = self._detect_topic_from_text(all_text)
                
                # Remove internal datetime fields
                session_data = {k: v for k, v in session.items() if not k.startswith("_")}
                
                sessions.append({
                    **session_data,
                    "topic": topic,
                    "promptCount": len(session["prompts"]),
                    "preview": (session["prompts"][0]["text"][:100] + "..." 
                               if session["prompts"] else ""),
                })
            
            sessions.sort(key=lambda s: s["lastTimestamp"], reverse=True)
            result.append({"date": day_group["date"], "sessions": sessions})
        
        return result
    
    def _detect_topic_from_text(self, text: str) -> str:
        """Detect topic from text content."""
        if "bug" in text or "fix" in text or "error" in text:
            return "Debugging"
        elif "test" in text:
            return "Testing"
        elif "create" in text or "new" in text or "add" in text:
            return "Feature development"
        elif "refactor" in text or "clean" in text:
            return "Refactoring"
        elif "explain" in text or "how" in text or "what" in text:
            return "Learning/Questions"
        elif "review" in text or "pr" in text:
            return "Code review"
        elif "database" in text or "sql" in text:
            return "Database work"
        elif "deploy" in text or "docker" in text:
            return "DevOps"
        return "General coding"
    
    async def get_stats(self) -> dict:
        """Get usage statistics."""
        stats = self.read_json(self.settings.stats_cache_path) or {}
        config = self.read_json(self.settings.config_path) or {}
        
        return {
            "stats": stats,
            "startupCount": config.get("numStartups", 0),
            "theme": config.get("theme", "dark"),
            "autoUpdates": config.get("autoUpdate", True),
        }


# Singleton instance
claude_reader = ClaudeReader()
