"""Research endpoints - Supervisor Agent API."""

import uuid
import asyncio
from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse

from ..config import get_settings
from ..services.cache import cache

router = APIRouter(tags=["research"])


class ResearchRequest(BaseModel):
    """Request to start a research task."""
    query: str = Field(..., min_length=10, max_length=2000, description="Research query")
    target_project: str = Field(..., description="Project path to save results")
    max_searches: int = Field(default=5, ge=1, le=15, description="Maximum search iterations")
    search_depth: str = Field(default="advanced", description="Search depth: basic or advanced")


class ResearchStatus(BaseModel):
    """Status of a research task."""
    task_id: str
    status: str  # pending, researching, writing, completed, failed
    query: str
    search_count: int
    max_searches: int
    current_phase: str
    findings_count: int
    started_at: str
    completed_at: Optional[str] = None
    saved_path: Optional[str] = None
    error: Optional[str] = None


# In-memory task storage (in production, use Redis or database)
_research_tasks: dict[str, dict] = {}


@router.post("/research/start")
async def start_research(request: ResearchRequest, background_tasks: BackgroundTasks):
    """Start a new research task."""
    settings = get_settings()
    
    # Check if API keys are configured
    if not settings.anthropic_api_key:
        raise HTTPException(
            status_code=400,
            detail="ANTHROPIC_API_KEY not configured. Please set it in .env file."
        )
    
    if not settings.tavily_api_key:
        raise HTTPException(
            status_code=400,
            detail="TAVILY_API_KEY not configured. Please set it in .env file."
        )
    
    # Create task
    task_id = str(uuid.uuid4())
    task = {
        "task_id": task_id,
        "status": "pending",
        "query": request.query,
        "target_project": request.target_project,
        "max_searches": request.max_searches,
        "search_depth": request.search_depth,
        "search_count": 0,
        "current_phase": "initializing",
        "findings": [],
        "findings_count": 0,
        "started_at": datetime.utcnow().isoformat(),
        "completed_at": None,
        "saved_path": None,
        "error": None,
        "events": [],  # For SSE streaming
    }
    
    _research_tasks[task_id] = task
    
    # Start research in background
    background_tasks.add_task(run_research_task, task_id)
    
    return {
        "task_id": task_id,
        "status": "pending",
        "message": "Research task started",
    }


async def run_research_task(task_id: str):
    """Run the research task using the Supervisor Agent."""
    task = _research_tasks.get(task_id)
    if not task:
        return
    
    try:
        task["status"] = "researching"
        task["current_phase"] = "importing supervisor agent"
        add_event(task_id, "status", "Starting research...")
        
        # Import the supervisor agent
        from ..agents.supervisor import create_supervisor_graph, ResearchState
        
        # Create the graph
        graph = create_supervisor_graph()
        
        # Initial state
        initial_state: ResearchState = {
            "messages": [],
            "research_query": task["query"],
            "research_findings": [],
            "search_count": 0,
            "max_searches": task["max_searches"],
            "is_sufficient": False,
            "final_summary": "",
            "target_project": task["target_project"],
        }
        
        task["current_phase"] = "running supervisor graph"
        add_event(task_id, "status", "Research in progress...")
        
        # Run the graph
        final_state = None
        async for state in graph.astream(initial_state):
            # Update task with current state
            if isinstance(state, dict):
                # Get the latest state from any node
                for node_name, node_state in state.items():
                    if isinstance(node_state, dict):
                        task["search_count"] = node_state.get("search_count", task["search_count"])
                        task["findings_count"] = len(node_state.get("research_findings", []))
                        
                        if node_state.get("research_findings"):
                            task["findings"] = node_state["research_findings"]
                        
                        if node_state.get("final_summary"):
                            task["final_summary"] = node_state["final_summary"]
                        
                        if node_state.get("saved_path"):
                            task["saved_path"] = node_state["saved_path"]
                        
                        final_state = node_state
                        
                        # Add event for streaming
                        add_event(task_id, "progress", {
                            "search_count": task["search_count"],
                            "findings_count": task["findings_count"],
                            "phase": node_name,
                        })
        
        # Complete
        task["status"] = "completed"
        task["current_phase"] = "completed"
        task["completed_at"] = datetime.utcnow().isoformat()
        add_event(task_id, "complete", {
            "saved_path": task.get("saved_path"),
            "findings_count": task["findings_count"],
        })
        
    except ImportError as e:
        task["status"] = "failed"
        task["error"] = f"Supervisor agent not available: {str(e)}"
        task["completed_at"] = datetime.utcnow().isoformat()
        add_event(task_id, "error", task["error"])
    except Exception as e:
        task["status"] = "failed"
        task["error"] = str(e)
        task["completed_at"] = datetime.utcnow().isoformat()
        add_event(task_id, "error", task["error"])


def add_event(task_id: str, event_type: str, data):
    """Add an event to the task's event queue."""
    task = _research_tasks.get(task_id)
    if task:
        task["events"].append({
            "type": event_type,
            "data": data,
            "timestamp": datetime.utcnow().isoformat(),
        })


@router.get("/research/{task_id}/status")
async def get_research_status(task_id: str):
    """Get current status of research task."""
    task = _research_tasks.get(task_id)
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return ResearchStatus(
        task_id=task["task_id"],
        status=task["status"],
        query=task["query"],
        search_count=task["search_count"],
        max_searches=task["max_searches"],
        current_phase=task["current_phase"],
        findings_count=task["findings_count"],
        started_at=task["started_at"],
        completed_at=task.get("completed_at"),
        saved_path=task.get("saved_path"),
        error=task.get("error"),
    )


@router.get("/research/{task_id}/result")
async def get_research_result(task_id: str):
    """Get full result of a completed research task."""
    task = _research_tasks.get(task_id)
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task["status"] not in ("completed", "failed"):
        raise HTTPException(status_code=400, detail="Task not yet completed")
    
    return {
        "task_id": task["task_id"],
        "status": task["status"],
        "query": task["query"],
        "summary": task.get("final_summary", ""),
        "findings": task.get("findings", []),
        "saved_path": task.get("saved_path"),
        "error": task.get("error"),
        "started_at": task["started_at"],
        "completed_at": task.get("completed_at"),
    }


@router.get("/research/{task_id}/stream")
async def stream_research_progress(task_id: str):
    """SSE endpoint for real-time progress updates."""
    task = _research_tasks.get(task_id)
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    async def event_generator():
        last_index = 0
        
        while True:
            current_task = _research_tasks.get(task_id)
            if not current_task:
                yield f"data: {{'type': 'error', 'message': 'Task not found'}}\n\n"
                break
            
            # Send any new events
            events = current_task.get("events", [])
            while last_index < len(events):
                event = events[last_index]
                import json
                yield f"data: {json.dumps(event)}\n\n"
                last_index += 1
            
            # Check if task is complete
            if current_task["status"] in ("completed", "failed"):
                break
            
            await asyncio.sleep(0.5)
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.delete("/research/{task_id}")
async def cancel_research(task_id: str):
    """Cancel a research task."""
    task = _research_tasks.get(task_id)
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task["status"] in ("completed", "failed"):
        raise HTTPException(status_code=400, detail="Task already finished")
    
    task["status"] = "cancelled"
    task["completed_at"] = datetime.utcnow().isoformat()
    add_event(task_id, "cancelled", "Task cancelled by user")
    
    return {"message": "Task cancelled"}


@router.get("/research/tasks")
async def list_research_tasks():
    """List all research tasks."""
    return {
        "tasks": [
            ResearchStatus(
                task_id=task["task_id"],
                status=task["status"],
                query=task["query"],
                search_count=task["search_count"],
                max_searches=task["max_searches"],
                current_phase=task["current_phase"],
                findings_count=task["findings_count"],
                started_at=task["started_at"],
                completed_at=task.get("completed_at"),
                saved_path=task.get("saved_path"),
                error=task.get("error"),
            )
            for task in _research_tasks.values()
        ]
    }
