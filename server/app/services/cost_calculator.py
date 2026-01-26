"""Cost calculation for Claude API usage."""

from dataclasses import dataclass
from typing import Optional


@dataclass
class ModelPricing:
    """Pricing per million tokens."""
    input: float
    output: float
    cache_read: float
    cache_write: float


# Claude API pricing (per million tokens)
PRICING = {
    "claude-opus-4-5-20251101": ModelPricing(
        input=15.0, output=75.0, cache_read=1.5, cache_write=18.75
    ),
    "claude-sonnet-4-20250514": ModelPricing(
        input=3.0, output=15.0, cache_read=0.3, cache_write=3.75
    ),
    "claude-3-5-sonnet-20241022": ModelPricing(
        input=3.0, output=15.0, cache_read=0.3, cache_write=3.75
    ),
    "claude-3-5-haiku-20241022": ModelPricing(
        input=0.8, output=4.0, cache_read=0.08, cache_write=1.0
    ),
}

DEFAULT_PRICING = ModelPricing(
    input=3.0, output=15.0, cache_read=0.3, cache_write=3.75
)


class CostCalculator:
    """Calculate API costs for Claude usage."""
    
    @staticmethod
    def get_pricing(model_id: str) -> ModelPricing:
        """Get pricing for a model."""
        return PRICING.get(model_id, DEFAULT_PRICING)
    
    @staticmethod
    def calculate_cost(
        model_id: str,
        input_tokens: int = 0,
        output_tokens: int = 0,
        cache_read_tokens: int = 0,
        cache_write_tokens: int = 0,
    ) -> float:
        """Calculate cost for a model's usage."""
        pricing = CostCalculator.get_pricing(model_id)
        
        input_cost = (input_tokens / 1_000_000) * pricing.input
        output_cost = (output_tokens / 1_000_000) * pricing.output
        cache_read_cost = (cache_read_tokens / 1_000_000) * pricing.cache_read
        cache_write_cost = (cache_write_tokens / 1_000_000) * pricing.cache_write
        
        return input_cost + output_cost + cache_read_cost + cache_write_cost
    
    @staticmethod
    def calculate_model_costs(model_usage: dict) -> dict:
        """Calculate costs for all models in usage dict."""
        cost_by_model = {}
        total_cost = 0.0
        
        for model_id, usage in model_usage.items():
            cost = CostCalculator.calculate_cost(
                model_id=model_id,
                input_tokens=usage.get("inputTokens", 0),
                output_tokens=usage.get("outputTokens", 0),
                cache_read_tokens=usage.get("cacheReadInputTokens", 0),
                cache_write_tokens=usage.get("cacheCreationInputTokens", 0),
            )
            cost_by_model[model_id] = {
                "cost": cost,
                "inputTokens": usage.get("inputTokens", 0),
                "outputTokens": usage.get("outputTokens", 0),
                "cacheReadTokens": usage.get("cacheReadInputTokens", 0),
                "cacheWriteTokens": usage.get("cacheCreationInputTokens", 0),
            }
            total_cost += cost
        
        return {"total": total_cost, "byModel": cost_by_model}
