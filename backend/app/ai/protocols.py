"""LLM provider protocol and shared prompt contracts (Task 7).

The ``LLMProvider`` protocol is provider-independent. Real adapters
(OpenAI-compatible, local inference, etc.) live in submodules and
conform to the same shape. The reasoning service depends only on
the protocol so swapping providers is a wiring concern.
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

from pydantic import BaseModel


@runtime_checkable
class LLMProvider(Protocol):
    """Provider-independent contract for one structured completion call.

    Implementations are expected to:

    * Take a textual ``prompt`` plus a Pydantic response model class.
    * Produce an instance of that response model (or raise
      ``ProviderError`` when the provider fails or the response fails
      validation).
    * Never invoke unconstrained code on the response; the
      ``response_model`` is the only allowed output shape.
    * Never read raw dataset rows; the caller passes a bounded
      context object via ``context``.
    """

    name: str

    def complete(
        self,
        *,
        prompt: str,
        response_model: type[BaseModel],
        context: dict[str, Any] | None = None,
    ) -> BaseModel: ...


__all__ = ["LLMProvider"]
