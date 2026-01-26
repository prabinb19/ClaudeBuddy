"""Researcher Worker - Uses Tavily to search for information."""

from typing import Optional
from langchain_anthropic import ChatAnthropic
from tavily import TavilyClient

from ..config import get_settings
from .state import ResearchState, ResearchFinding


def get_tavily_client() -> TavilyClient:
    """Get Tavily client with API key."""
    settings = get_settings()
    return TavilyClient(api_key=settings.tavily_api_key)


def get_llm() -> ChatAnthropic:
    """Get Claude LLM for query generation."""
    settings = get_settings()
    return ChatAnthropic(
        model=settings.default_model,
        api_key=settings.anthropic_api_key,
    )


def generate_search_query(
    original_query: str,
    existing_findings: list[ResearchFinding],
    search_count: int,
) -> str:
    """Generate a search query based on what's missing.
    
    For the first search, use the original query.
    For subsequent searches, analyze gaps and generate targeted queries.
    """
    if search_count == 0 or not existing_findings:
        # First search - use original query
        return original_query
    
    # For subsequent searches, try to find gaps
    llm = get_llm()
    
    # Summarize what we already know
    existing_summary = "\n".join([
        f"- {f.get('title', 'Untitled')}: {f.get('content', '')[:200]}..."
        for f in existing_findings[:5]
    ])
    
    prompt = f"""Based on the original research query and what we've already found, generate a NEW, DIFFERENT search query to fill gaps in our knowledge.

Original Query: {original_query}

What we've found so far:
{existing_summary}

Generate a single search query (just the query text, nothing else) that will help us find NEW information we don't already have. Focus on:
1. Different aspects of the topic not yet covered
2. More specific details or examples
3. Recent developments or updates
4. Alternative perspectives or approaches

Search query:"""

    response = llm.invoke(prompt)
    new_query = response.content.strip()
    
    # Fallback to original if generation fails
    if not new_query or len(new_query) < 5:
        return f"{original_query} details examples"
    
    return new_query


async def researcher_node(state: ResearchState) -> dict:
    """Researcher worker node - Uses Tavily to search for information.
    
    This node:
    1. Generates a search query (different for subsequent searches)
    2. Performs Tavily search
    3. Adds findings to state
    4. Increments search count
    """
    settings = get_settings()
    tavily = get_tavily_client()
    
    # Generate search query
    search_query = generate_search_query(
        original_query=state["research_query"],
        existing_findings=state["research_findings"],
        search_count=state["search_count"],
    )
    
    # Perform Tavily search
    try:
        results = tavily.search(
            query=search_query,
            search_depth="advanced",
            max_results=5,
            include_raw_content=True,
        )
        
        # Extract findings
        new_findings: list[ResearchFinding] = []
        for result in results.get("results", []):
            finding: ResearchFinding = {
                "title": result.get("title", "Untitled"),
                "url": result.get("url", ""),
                "content": result.get("content", ""),
                "score": result.get("score", 0.0),
                "raw_content": result.get("raw_content"),
            }
            new_findings.append(finding)
        
        # Combine with existing findings (dedupe by URL)
        existing_urls = {f.get("url") for f in state["research_findings"]}
        unique_new = [f for f in new_findings if f.get("url") not in existing_urls]
        
        all_findings = state["research_findings"] + unique_new
        
        return {
            "research_findings": all_findings,
            "search_count": state["search_count"] + 1,
            "messages": [
                {"role": "assistant", "content": f"Searched for: {search_query}\nFound {len(unique_new)} new results."}
            ],
        }
        
    except Exception as e:
        # On error, still increment count to prevent infinite loops
        return {
            "search_count": state["search_count"] + 1,
            "messages": [
                {"role": "assistant", "content": f"Search error: {str(e)}"}
            ],
        }
