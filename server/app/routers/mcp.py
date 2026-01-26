"""MCP (Model Context Protocol) servers browser endpoint."""

import re
from typing import Optional
from fastapi import APIRouter, Query
import httpx

from ..services.cache import cache
from ..config import get_settings

router = APIRouter(tags=["mcp"])


def categorize_server(name: str, description: str) -> str:
    """Categorize MCP server based on name/description."""
    text = f"{name} {description}".lower()
    
    if re.search(r"postgres|mysql|sqlite|database|db|mongo|redis|supabase", text):
        return "database"
    if re.search(r"github|gitlab|git|bitbucket", text):
        return "dev"
    if re.search(r"docker|kubernetes|k8s|container", text):
        return "dev"
    if re.search(r"aws|gcp|azure|cloud|s3|lambda", text):
        return "cloud"
    if re.search(r"slack|discord|telegram|email|notification", text):
        return "communication"
    if re.search(r"notion|linear|jira|asana|todoist|trello", text):
        return "productivity"
    if re.search(r"fetch|web|scrape|browser|puppeteer|playwright|http", text):
        return "web"
    if re.search(r"search|brave|google|bing", text):
        return "web"
    if re.search(r"file|filesystem|fs|memory|storage", text):
        return "core"
    
    return "other"


async def fetch_mcp_from_github() -> list[dict]:
    """Fetch MCP servers from GitHub."""
    queries = [
        "mcp-server in:name,description",
        "model-context-protocol in:name,description",
        "anthropic mcp in:name,description",
    ]
    
    all_repos = []
    seen = set()
    
    async with httpx.AsyncClient() as client:
        for query in queries:
            try:
                url = f"https://api.github.com/search/repositories?q={query}&sort=stars&order=desc&per_page=30"
                response = await client.get(
                    url,
                    headers={
                        "Accept": "application/vnd.github.v3+json",
                        "User-Agent": "claudebuddy-dashboard",
                    },
                    timeout=10.0,
                )
                
                if response.status_code != 200:
                    continue
                
                data = response.json()
                for repo in data.get("items", []):
                    full_name = repo.get("full_name")
                    if full_name and full_name not in seen:
                        seen.add(full_name)
                        all_repos.append(repo)
            except Exception:
                pass
    
    return all_repos


async def fetch_mcp_from_smithery() -> list[dict]:
    """Fetch from Smithery.ai registry."""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://registry.smithery.ai/servers?pageSize=50",
                headers={
                    "Accept": "application/json",
                    "User-Agent": "claudebuddy-dashboard",
                },
                timeout=10.0,
            )
            
            if response.status_code != 200:
                return []
            
            data = response.json()
            return data.get("servers", [])
    except Exception:
        return []


@router.get("/mcp")
async def get_mcp_servers(refresh: Optional[str] = Query(None)):
    """Get MCP servers (combined from multiple sources)."""
    settings = get_settings()
    cache_key = "mcp_servers"
    
    # Check cache (skip if refresh requested)
    if refresh != "1":
        cached = cache.get(cache_key)
        if cached:
            return cached
    
    # Fetch from sources in parallel
    import asyncio
    github_repos, smithery_servers = await asyncio.gather(
        fetch_mcp_from_github(),
        fetch_mcp_from_smithery(),
    )
    
    servers = []
    seen = set()
    
    # Process Smithery servers first (they have better metadata)
    for server in smithery_servers:
        server_id = server.get("qualifiedName") or server.get("name")
        if not server_id or server_id in seen:
            continue
        seen.add(server_id)
        
        servers.append({
            "id": server_id,
            "name": server.get("displayName") or server.get("name"),
            "description": server.get("description", ""),
            "category": categorize_server(server.get("name", ""), server.get("description", "")),
            "author": server.get("vendor", "Community"),
            "source": "smithery",
            "homepage": server.get("homepage", ""),
            "install": f"npx -y {server_id}" if server.get("qualifiedName") else "",
            "stars": None,
            "useCount": server.get("useCount", 0),
            "createdAt": server.get("createdAt"),
        })
    
    # Process GitHub repos
    for repo in github_repos:
        repo_id = repo.get("name")
        full_name = repo.get("full_name")
        if not repo_id or repo_id in seen or full_name in seen:
            continue
        seen.add(repo_id)
        
        # Try to determine npm package name
        npm_package = ""
        if full_name and (full_name.startswith("anthropics/") or full_name.startswith("modelcontextprotocol/")):
            npm_package = f"@anthropic-ai/{repo_id}"
        elif repo_id.startswith("mcp-"):
            npm_package = repo_id
        
        servers.append({
            "id": repo_id,
            "name": re.sub(r"^mcp-server-?", "", repo_id, flags=re.I).replace("-", " "),
            "description": repo.get("description", ""),
            "category": categorize_server(repo_id, repo.get("description", "")),
            "author": repo.get("owner", {}).get("login", "Unknown"),
            "source": "github",
            "homepage": repo.get("html_url"),
            "install": f"npx -y {npm_package}" if npm_package else f"git clone {repo.get('clone_url')}",
            "stars": repo.get("stargazers_count"),
            "forks": repo.get("forks_count"),
            "updatedAt": repo.get("updated_at"),
        })
    
    # Sort by stars/popularity
    servers.sort(
        key=lambda s: (s.get("stars") or 0) + (s.get("useCount") or 0) * 10,
        reverse=True,
    )
    
    from datetime import datetime
    result = {"servers": servers, "fetchedAt": datetime.utcnow().isoformat()}
    
    # Cache results
    cache.set(cache_key, result, settings.mcp_cache_ttl)
    
    return result
