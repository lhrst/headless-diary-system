"""Tests for tag operations."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_tag_suggest(auth_client: AsyncClient):
    # Create entries with tags
    await auth_client.post("/api/v1/diary", json={
        "content": "内容 #牙冠设计 #工作",
    })
    await auth_client.post("/api/v1/diary", json={
        "content": "内容 #牙列分割 #工作",
    })

    resp = await auth_client.get("/api/v1/tags/suggest", params={"q": "牙"})
    assert resp.status_code == 200
    suggestions = resp.json()["suggestions"]
    assert len(suggestions) >= 1


@pytest.mark.asyncio
async def test_list_all_tags(auth_client: AsyncClient):
    await auth_client.post("/api/v1/diary", json={
        "content": "内容 #标签一 #标签二",
    })

    resp = await auth_client.get("/api/v1/tags")
    assert resp.status_code == 200
