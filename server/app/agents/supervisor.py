"""Supervisor Agent - Orchestrates the research workflow using LangGraph."""

from typing import Literal
from langchain_anthropic import ChatAnthropic
from langgraph.graph import StateGraph, END

from ..config import get_settings
from .state import ResearchState, ResearchFinding
from .researcher import researcher_node
from .writer import writer_node
from .tools import save_to_project_node


def get_llm() -> ChatAnthropic:
    """Get Claude LLM for supervisor decisions."""
    settings = get_settings()
    return ChatAnthropic(
        model=settings.default_model,
        api_key=settings.anthropic_api_key,
    )


def summarize_findings(findings: list[ResearchFinding]) -> str:
    """Create a brief summary of current findings for decision-making."""
    if not findings:
        return "No findings yet."
    
    summaries = []
    for i, finding in enumerate(findings[:10], 1):  # Limit to first 10
        title = finding.get("title", "Untitled")
        content = finding.get("content", "")[:200]
        summaries.append(f"{i}. {title}: {content}...")
    
    return "\n".join(summaries)


async def supervisor_node(state: ResearchState) -> dict:
    """Supervisor node - Evaluates current state and makes routing decisions.
    
    This is the entry point that initializes the workflow.
    Actual routing decisions are made by should_continue_research.
    """
    # If this is the first call, just pass through to start research
    if state["search_count"] == 0:
        return {
            "messages": [
                {"role": "assistant", "content": f"Starting research on: {state['research_query']}"}
            ],
        }
    
    # For subsequent calls, the routing is handled by should_continue_research
    return {}


def should_continue_research(state: ResearchState) -> Literal["research", "write"]:
    """LLM-based decision: continue researching or start writing.
    
    This is the KEY CHALLENGE solution - using an LLM to intelligently
    decide when we have enough information to write a comprehensive summary.
    
    The decision considers:
    1. Information coverage - are main aspects of the query addressed?
    2. Concrete facts - do we have specific data, examples, numbers?
    3. Diminishing returns - are we finding new vs. repeated info?
    4. Safety limits - don't exceed max_searches
    """
    # Safety limit check first
    if state["search_count"] >= state["max_searches"]:
        return "write"
    
    # If no findings yet, definitely need to research
    if not state["research_findings"]:
        return "research"
    
    # If only 1 search done, usually need more
    if state["search_count"] < 2:
        return "research"
    
    # Use LLM to evaluate sufficiency
    llm = get_llm()
    
    findings_summary = summarize_findings(state["research_findings"])
    
    prompt = f"""You are evaluating whether we have gathered SUFFICIENT information to write a comprehensive research summary.

## Original Research Query
{state["research_query"]}

## Research Progress
- Searches completed: {state["search_count"]} / {state["max_searches"]}
- Sources found: {len(state["research_findings"])}

## Current Findings Summary
{findings_summary}

## Evaluation Criteria
Answer these questions:
1. Are the MAIN aspects of the query covered? (main concepts, not edge cases)
2. Do we have CONCRETE facts, examples, or data? (not just vague overviews)
3. Are we seeing DIMINISHING RETURNS? (new searches returning similar info)
4. Are there OBVIOUS GAPS that one more targeted search would fill?

## Decision
Based on your evaluation, should we:
- RESEARCH: Continue gathering more information (there are clear gaps)
- WRITE: We have sufficient information to write a good summary

Respond with ONLY one word: "RESEARCH" or "WRITE"
"""

    try:
        response = llm.invoke(prompt)
        decision = response.content.strip().upper()
        
        if "WRITE" in decision:
            return "write"
        elif "RESEARCH" in decision:
            return "research"
        else:
            # Default to research if unclear, unless we have many searches
            if state["search_count"] >= 3:
                return "write"
            return "research"
            
    except Exception:
        # On error, use heuristics
        if state["search_count"] >= 3 and len(state["research_findings"]) >= 5:
            return "write"
        return "research"


def create_supervisor_graph() -> StateGraph:
    """Create the compiled supervisor graph.
    
    Graph structure:
    
    START -> supervisor -> (conditional) -> researcher -> supervisor (loop)
                                        -> writer -> save_results -> END
    
    The supervisor evaluates the state and decides whether to:
    1. Continue researching (route to researcher)
    2. Start writing (route to writer, then save)
    """
    # Create the graph with our state type
    workflow = StateGraph(ResearchState)
    
    # Add nodes
    workflow.add_node("supervisor", supervisor_node)
    workflow.add_node("researcher", researcher_node)
    workflow.add_node("writer", writer_node)
    workflow.add_node("save_results", save_to_project_node)
    
    # Set entry point
    workflow.set_entry_point("supervisor")
    
    # Add conditional routing from supervisor
    workflow.add_conditional_edges(
        "supervisor",
        should_continue_research,
        {
            "research": "researcher",
            "write": "writer",
        }
    )
    
    # Researcher loops back to supervisor for evaluation
    workflow.add_edge("researcher", "supervisor")
    
    # Writer proceeds to save, then ends
    workflow.add_edge("writer", "save_results")
    workflow.add_edge("save_results", END)
    
    # Compile and return
    return workflow.compile()


# Export for convenience
__all__ = ["create_supervisor_graph", "ResearchState"]
