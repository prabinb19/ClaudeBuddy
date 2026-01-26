"""Writer Worker - Synthesizes research into a structured summary."""

from langchain_anthropic import ChatAnthropic

from ..config import get_settings
from .state import ResearchState, ResearchFinding


def get_llm() -> ChatAnthropic:
    """Get Claude LLM for writing."""
    settings = get_settings()
    return ChatAnthropic(
        model=settings.default_model,
        api_key=settings.anthropic_api_key,
        max_tokens=4096,
    )


def format_findings(findings: list[ResearchFinding]) -> str:
    """Format research findings for the prompt."""
    formatted = []
    
    for i, finding in enumerate(findings, 1):
        title = finding.get("title", "Untitled")
        url = finding.get("url", "")
        content = finding.get("content", "")
        raw_content = finding.get("raw_content", "")
        
        # Use raw_content if available and longer
        full_content = raw_content if raw_content and len(raw_content) > len(content) else content
        
        # Truncate very long content
        if len(full_content) > 2000:
            full_content = full_content[:2000] + "..."
        
        formatted.append(f"""
### Source {i}: {title}
URL: {url}

{full_content}
""")
    
    return "\n---\n".join(formatted)


async def writer_node(state: ResearchState) -> dict:
    """Writer worker node - Synthesizes research into a structured summary.
    
    This node:
    1. Takes all research findings
    2. Uses Claude to synthesize into a comprehensive summary
    3. Formats as Markdown with proper structure
    """
    llm = get_llm()
    
    findings_text = format_findings(state["research_findings"])
    
    prompt = f"""You are a research synthesizer. Based on the following research findings, write a comprehensive, well-structured summary.

## Original Research Query
{state["research_query"]}

## Research Findings ({len(state["research_findings"])} sources found)
{findings_text}

## Your Task
Write a comprehensive research summary in Markdown format with the following structure:

1. **Executive Summary** (2-3 sentences capturing the key takeaway)

2. **Key Findings** (bullet points of the most important facts/insights)

3. **Detailed Analysis** (organized by subtopics, with proper headings)

4. **Practical Implications** (how this information can be applied)

5. **Sources** (numbered list of all sources with URLs)

Guidelines:
- Be factual and cite sources where appropriate
- Use clear, professional language
- Organize information logically
- Highlight areas of consensus and any conflicting information
- Include specific examples, numbers, or quotes where available
- Note any gaps in the research or areas needing further investigation

Write the summary now:"""

    response = await llm.ainvoke(prompt)
    
    return {
        "final_summary": response.content,
        "messages": [
            {"role": "assistant", "content": "Research summary completed."}
        ],
    }
