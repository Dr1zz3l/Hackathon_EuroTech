"""
Anthropic client singleton.

Reads ANTHROPIC_API_KEY from the environment (via python-dotenv on startup
in app.py). Never logs or echoes the key.
"""

import anthropic

_client: anthropic.Anthropic | None = None
_async_client: anthropic.AsyncAnthropic | None = None


def get_client() -> anthropic.Anthropic:
    """Return the module-level Anthropic client, creating it on first call."""
    global _client
    if _client is None:
        # anthropic.Anthropic() reads ANTHROPIC_API_KEY from env automatically.
        # Raises AuthenticationError at call-time if the key is missing/invalid.
        _client = anthropic.Anthropic()
    return _client


def get_async_client() -> anthropic.AsyncAnthropic:
    """Return the module-level async client (used by the streaming chat endpoint)."""
    global _async_client
    if _async_client is None:
        _async_client = anthropic.AsyncAnthropic()
    return _async_client
