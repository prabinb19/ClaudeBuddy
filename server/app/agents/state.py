"""LangGraph state definitions for the Research Supervisor Agent."""

from typing import TypedDict, Annotated, Sequence, Optional
from langgraph.graph.message import add_messages


class ResearchFinding(TypedDict):
    """A single research finding from Tavily."""
    title: str
    url: str
    content: str
    score: float
    raw_content: Optional[str]


class ResearchState(TypedDict):
    """State for the research workflow.
    
    This state is passed between all nodes in the supervisor graph.
    """
    # Message history for context
    messages: Annotated[Sequence, add_messages]
    
    # The original research query from the user
    research_query: str
    
    # Accumulated research findings from Tavily searches
    research_findings: list[ResearchFinding]
    
    # Current search iteration count
    search_count: int
    
    # Maximum allowed searches (safety limit)
    max_searches: int
    
    # Flag indicating if we have sufficient information
    is_sufficient: bool
    
    # The final written summary (Markdown format)
    final_summary: str
    
    # Target project directory to save results
    target_project: str
    
    # Path where the research was saved (set by save node)
    saved_path: Optional[str]
