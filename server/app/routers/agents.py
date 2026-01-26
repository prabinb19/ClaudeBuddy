"""Agents endpoint - Trending CLAUDE.md files browser."""

import re
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Query
import httpx

from ..services.cache import cache
from ..config import get_settings

router = APIRouter(tags=["agents"])


def categorize_agent(content: str, language: Optional[str], repo_name: str) -> str:
    """Categorize agent based on CLAUDE.md content and repo info."""
    text = f"{content} {repo_name}".lower()
    
    if re.search(r"react|next\.js|nextjs|vue|svelte|angular|frontend", text):
        return "frontend"
    if re.search(r"node|express|fastapi|django|flask|backend|api|server", text):
        return "backend"
    if re.search(r"python|ml|machine learning|ai|data|pandas|numpy", text):
        return "python"
    if re.search(r"rust|cargo|rustc", text):
        return "rust"
    if re.search(r"go|golang", text):
        return "go"
    if re.search(r"typescript|ts", text):
        return "typescript"
    if re.search(r"test|jest|pytest|testing|spec", text):
        return "testing"
    if re.search(r"docker|kubernetes|devops|ci\/cd|deploy", text):
        return "devops"
    if re.search(r"cli|command|terminal", text):
        return "cli"
    
    # Fall back to language
    if language:
        lang = language.lower()
        if lang in ("javascript", "typescript"):
            return "typescript"
        if lang == "python":
            return "python"
        if lang == "rust":
            return "rust"
        if lang == "go":
            return "go"
    
    return "general"


async def fetch_agents_from_github() -> list[dict]:
    """Fetch repositories likely to have CLAUDE.md files from GitHub."""
    queries = [
        "CLAUDE.md in:readme",
        "claude code instructions in:readme",
        '"claude code" in:description',
        "anthropic claude project in:readme stars:>10",
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


async def fetch_claude_md_content(owner: str, repo: str, path: str = "CLAUDE.md") -> Optional[str]:
    """Fetch CLAUDE.md content from a repository."""
    branches = ["main", "master"]
    
    async with httpx.AsyncClient() as client:
        for branch in branches:
            try:
                raw_url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}"
                response = await client.get(
                    raw_url,
                    headers={"User-Agent": "claudebuddy-dashboard"},
                    timeout=10.0,
                )
                if response.status_code == 200:
                    return response.text
            except Exception:
                pass
    
    return None


@router.get("/agents")
async def get_agents(refresh: Optional[str] = Query(None)):
    """Get trending CLAUDE.md files from GitHub."""
    settings = get_settings()
    cache_key = "agents"
    
    # Check cache
    if refresh != "1":
        cached = cache.get(cache_key)
        if cached:
            return cached
    
    # Fetch from GitHub
    search_results = await fetch_agents_from_github()
    
    # Process results - try to fetch CLAUDE.md from each repo
    agents = []
    
    import asyncio
    
    async def process_repo(repo: dict) -> Optional[dict]:
        full_name = repo.get("full_name")
        if not full_name:
            return None
        
        owner = repo.get("owner", {}).get("login")
        name = repo.get("name")
        
        if not owner or not name:
            return None
        
        # Try to fetch CLAUDE.md content
        content = await fetch_claude_md_content(owner, name)
        
        # Skip repos without CLAUDE.md
        if not content:
            return None
        
        # Create preview (first 300 chars, strip markdown headers)
        preview = re.sub(r"^#+\s+", "", content, flags=re.MULTILINE)
        preview = re.sub(r"\n+", " ", preview)[:300].strip()
        
        return {
            "id": full_name,
            "name": name,
            "author": owner,
            "description": repo.get("description", ""),
            "stars": repo.get("stargazers_count", 0),
            "language": repo.get("language"),
            "category": categorize_agent(content, repo.get("language"), name),
            "content": content,
            "preview": preview + ("..." if len(content) > 300 else ""),
            "url": repo.get("html_url"),
            "claudeUrl": f"https://github.com/{full_name}/blob/{repo.get('default_branch', 'main')}/CLAUDE.md",
            "updatedAt": repo.get("updated_at"),
            "topics": repo.get("topics", []),
        }
    
    # Process repos (limit to 50)
    tasks = [process_repo(repo) for repo in search_results[:50]]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    agents = [r for r in results if r and not isinstance(r, Exception)]
    
    # Sort by stars
    agents.sort(key=lambda a: a.get("stars", 0), reverse=True)
    
    result = {
        "agents": agents,
        "fetchedAt": datetime.utcnow().isoformat(),
        "totalFound": len(search_results),
    }
    
    # Cache results
    cache.set(cache_key, result, settings.agents_cache_ttl)
    
    return result
