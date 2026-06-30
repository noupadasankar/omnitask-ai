"""Tests for the AIClient helper (ai.py)."""

import os
import json
from unittest.mock import patch, MagicMock, AsyncMock

import pytest


class TestAIClientAvailable:
    def test_not_available_without_key(self):
        from ai import AIClient
        os.environ.pop("OPENAI_API_KEY", None)
        client = AIClient()
        assert client.available is False

    def test_not_available_without_openai_package(self):
        from ai import AIClient
        os.environ["OPENAI_API_KEY"] = "sk-xxx"
        with patch.dict("sys.modules", {"openai": None}, clear=True):
            client = AIClient()
            client._openai_ok = None
            assert client.available is False

    def test_available_with_key_and_package(self, mock_openai):
        from ai import AIClient
        client = AIClient()
        assert client.available is True

    def test_available_caches_result(self, mock_openai):
        from ai import AIClient
        client = AIClient()
        assert client.available is True
        assert client._openai_ok is True


class TestAIClientExtract:
    @pytest.mark.asyncio
    async def test_extract_json_returns_none_when_not_available(self):
        from ai import AIClient
        client = AIClient()
        result = await client.extract_json("system", "user")
        assert result is None

    @pytest.mark.asyncio
    async def test_extract_json_with_mock(self, mock_openai):
        from ai import AIClient
        client = AIClient()
        mock_response = MagicMock()
        mock_response.choices = [
            MagicMock(message=MagicMock(content=json.dumps({"items": ["a", "b"]})))
        ]
        mock_openai_client = MagicMock()
        mock_openai_client.chat.completions.create = AsyncMock(return_value=mock_response)
        with patch.object(client, "_ensure", return_value=mock_openai_client):
            result = await client.extract_json("system", "user text")
            assert result == {"items": ["a", "b"]}

    @pytest.mark.asyncio
    async def test_extract_json_timeout_returns_none(self, mock_openai):
        from ai import AIClient
        client = AIClient()
        mock_openai_client = MagicMock()
        mock_openai_client.chat.completions.create = AsyncMock(side_effect=Exception("Timeout"))
        with patch.object(client, "_ensure", return_value=mock_openai_client):
            result = await client.extract_json("system", "user")
            assert result is None

    @pytest.mark.asyncio
    async def test_summarize(self, mock_openai):
        from ai import AIClient
        client = AIClient()
        mock_openai_client = MagicMock()
        mock_response = MagicMock()
        mock_response.choices = [MagicMock(message=MagicMock(content="Summary here"))]
        mock_openai_client.chat.completions.create = AsyncMock(return_value=mock_response)
        with patch.object(client, "_ensure", return_value=mock_openai_client):
            result = await client.summarize("long text", "summarize")
            assert result == "Summary here"

    def test_model_default(self):
        from ai import AIClient
        client = AIClient()
        assert client.model == "gpt-4o-mini"

    def test_model_from_env(self):
        os.environ["PY_LLM_MODEL"] = "gpt-4o"
        from ai import AIClient
        client = AIClient()
        assert client.model == "gpt-4o"


class TestAIClientDecideAction:
    @pytest.mark.asyncio
    async def test_decide_action_returns_done_when_unavailable(self):
        from ai import AIClient
        client = AIClient()
        result = await client.decide_action("b64", [], "goal", [])
        assert result["done"] is True
        assert result["action"] == "done"

    @pytest.mark.asyncio
    async def test_vision_available_matches_available(self, mock_openai):
        from ai import AIClient
        client = AIClient()
        assert client.vision_available == client.available
