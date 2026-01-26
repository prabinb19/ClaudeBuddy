"""Projects and sessions endpoints."""

from fastapi import APIRouter, HTTPException

from ..services.claude_reader import claude_reader
from ..config import get_settings

router = APIRouter(tags=["projects"])


@router.get("/projects")
async def get_projects():
    """Get all projects with insights."""
    return await claude_reader.get_all_projects()


@router.get("/sessions/{project_id}/{session_id}")
async def get_session(project_id: str, session_id: str):
    """Get session details."""
    session = await claude_reader.get_session(project_id, session_id)
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return session


@router.get("/sessions/{project_id}/{session_id}/code")
async def get_session_code(project_id: str, session_id: str):
    """Get code operations for a session (lighter endpoint)."""
    settings = get_settings()
    session_path = settings.projects_dir / project_id / f"{session_id}.jsonl"
    
    if not session_path.exists():
        raise HTTPException(status_code=404, detail="Session not found")
    
    raw_messages = await claude_reader.parse_jsonl(session_path)
    code_operations = claude_reader.extract_code_operations(raw_messages)
    
    # Group by file
    file_changes = {}
    for op in code_operations:
        if op["type"] in ("write", "edit"):
            file_path = op.get("filePath") or "unknown"
            if file_path not in file_changes:
                file_changes[file_path] = {
                    "path": file_path,
                    "language": op.get("language"),
                    "operations": [],
                }
            file_changes[file_path]["operations"].append(op)
    
    # Get bash commands
    commands = [
        {
            "command": op.get("command"),
            "description": op.get("description"),
            "timestamp": op.get("timestamp"),
        }
        for op in code_operations
        if op["type"] == "bash"
    ]
    
    return {
        "sessionId": session_id,
        "fileChanges": list(file_changes.values()),
        "commands": commands,
        "summary": {
            "filesModified": len(file_changes),
            "totalEdits": len([op for op in code_operations if op["type"] == "edit"]),
            "totalWrites": len([op for op in code_operations if op["type"] == "write"]),
            "totalCommands": len(commands),
        },
    }
