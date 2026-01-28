"""Snippets - discover and reuse markdown files across projects."""

from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException
import urllib.parse

from ..services.team_sync import get_snippets_service

router = APIRouter(tags=["snippets"])


class CopyRequest(BaseModel):
    """Request to copy content to a project."""
    target_project: str = Field(..., description="Path to target project")
    mode: str = Field(default="append", description="append or replace")


@router.get("/snippets")
async def list_markdown_files():
    """List all markdown files across all projects."""
    service = get_snippets_service()
    return await service.get_all_markdown_files()


@router.get("/snippets/file")
async def get_file(path: str):
    """Get content of a markdown file."""
    # URL decode the path
    decoded_path = urllib.parse.unquote(path)

    service = get_snippets_service()
    result = service.get_file_content(decoded_path)

    if not result:
        raise HTTPException(status_code=404, detail="File not found")

    return result


@router.post("/snippets/copy")
async def copy_to_project(path: str, request: CopyRequest):
    """Copy a markdown file's content to a project's CLAUDE.md."""
    decoded_path = urllib.parse.unquote(path)

    service = get_snippets_service()
    result = service.copy_to_project(
        source_path=decoded_path,
        target_project=request.target_project,
        mode=request.mode,
    )

    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])

    return result
