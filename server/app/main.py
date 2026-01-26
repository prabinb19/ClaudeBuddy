"""ClaudeBuddy FastAPI Application Entry Point."""

import uvicorn
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from .config import get_settings
from .routers import (
    stats_router,
    history_router,
    projects_router,
    mcp_router,
    agents_router,
    insights_router,
    research_router,
)


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()
    
    app = FastAPI(
        title="ClaudeBuddy",
        description="Your friendly companion dashboard for Claude Code with Supervisor Agent",
        version="2.0.0",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
    )
    
    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Include routers with /api prefix
    app.include_router(stats_router, prefix="/api")
    app.include_router(history_router, prefix="/api")
    app.include_router(projects_router, prefix="/api")
    app.include_router(mcp_router, prefix="/api")
    app.include_router(agents_router, prefix="/api")
    app.include_router(insights_router, prefix="/api")
    app.include_router(research_router, prefix="/api")
    
    # Serve static files (React build)
    client_dist = Path(__file__).parent.parent.parent / "client" / "dist"
    if client_dist.exists():
        app.mount("/assets", StaticFiles(directory=client_dist / "assets"), name="assets")
        
        @app.get("/{path:path}")
        async def serve_spa(path: str):
            """Serve the React SPA for any non-API routes."""
            # Check if requesting a static file
            file_path = client_dist / path
            if file_path.exists() and file_path.is_file():
                return FileResponse(file_path)
            # Otherwise serve index.html for SPA routing
            return FileResponse(client_dist / "index.html")
        
        @app.get("/")
        async def serve_index():
            """Serve the index.html for the root path."""
            return FileResponse(client_dist / "index.html")
    
    return app


app = create_app()


def run():
    """Run the server."""
    settings = get_settings()
    print(f"ClaudeBuddy running at http://localhost:{settings.port}")
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )


if __name__ == "__main__":
    run()
