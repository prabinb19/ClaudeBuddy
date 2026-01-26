"""History endpoints."""

from fastapi import APIRouter, HTTPException

from ..services.claude_reader import claude_reader
from ..config import get_settings

router = APIRouter(tags=["history"])


@router.get("/history")
async def get_history():
    """Get command history grouped by date and session."""
    return await claude_reader.get_history()


@router.get("/history/session/{session_id}")
async def get_history_session(session_id: str):
    """Load full conversation for a session from history."""
    settings = get_settings()
    projects_dir = settings.projects_dir
    
    if not projects_dir.exists():
        raise HTTPException(status_code=404, detail="No projects found")
    
    # Search for the session file across all projects
    session_path = None
    project_path = None
    
    for project_dir in projects_dir.iterdir():
        if not project_dir.is_dir():
            continue
        
        possible_path = project_dir / f"{session_id}.jsonl"
        if possible_path.exists():
            session_path = possible_path
            project_path = project_dir.name.replace("-", "/")
            break
    
    if not session_path:
        raise HTTPException(status_code=404, detail="Session not found")
    
    raw_messages = await claude_reader.parse_jsonl(session_path)
    
    # Filter and format messages
    messages = []
    for msg in raw_messages:
        msg_type = msg.get("type")
        role = msg.get("message", {}).get("role")
        
        if msg_type in ("user", "assistant") or role in ("user", "assistant"):
            actual_role = "user" if msg_type == "user" or role == "user" else "assistant"
            content = claude_reader.extract_content(msg.get("message"))
            
            if content:
                messages.append({
                    "role": actual_role,
                    "content": content,
                    "timestamp": msg.get("timestamp"),
                    "model": msg.get("message", {}).get("model"),
                })
    
    return {
        "sessionId": session_id,
        "project": project_path,
        "messageCount": len(messages),
        "messages": messages,
    }
