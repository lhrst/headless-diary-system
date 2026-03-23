"""Tests for diary CRUD operations."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_diary(auth_client: AsyncClient):
    resp = await auth_client.post("/api/v1/diary", json={
        "content": "今天是个好日子 #测试 #日记",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["tags"] == ["测试", "日记"]
    assert data["content"] == "今天是个好日子 #测试 #日记"


@pytest.mark.asyncio
async def test_list_diaries(auth_client: AsyncClient):
    # Create two entries
    await auth_client.post("/api/v1/diary", json={"content": "第一篇日记 #工作"})
    await auth_client.post("/api/v1/diary", json={"content": "第二篇日记 #生活"})

    resp = await auth_client.get("/api/v1/diary")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 2


@pytest.mark.asyncio
async def test_get_diary(auth_client: AsyncClient):
    # Create
    create_resp = await auth_client.post("/api/v1/diary", json={
        "content": "测试获取单篇日记",
    })
    diary_id = create_resp.json()["id"]

    # Get
    resp = await auth_client.get(f"/api/v1/diary/{diary_id}")
    assert resp.status_code == 200
    assert "测试获取单篇日记" in resp.json()["content"]


@pytest.mark.asyncio
async def test_update_diary(auth_client: AsyncClient):
    create_resp = await auth_client.post("/api/v1/diary", json={
        "content": "原始内容",
    })
    diary_id = create_resp.json()["id"]

    resp = await auth_client.put(f"/api/v1/diary/{diary_id}", json={
        "content": "更新后的内容 #新标签",
    })
    assert resp.status_code == 200
    assert resp.json()["tags"] == ["新标签"]


@pytest.mark.asyncio
async def test_delete_diary(auth_client: AsyncClient):
    create_resp = await auth_client.post("/api/v1/diary", json={
        "content": "即将删除",
    })
    diary_id = create_resp.json()["id"]

    resp = await auth_client.delete(f"/api/v1/diary/{diary_id}")
    assert resp.status_code == 204

    resp = await auth_client.get(f"/api/v1/diary/{diary_id}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_search_diary(auth_client: AsyncClient):
    await auth_client.post("/api/v1/diary", json={
        "content": "今天讨论了牙冠设计的问题 #牙科",
    })

    resp = await auth_client.get("/api/v1/diary", params={"q": "牙冠"})
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_filter_by_tag(auth_client: AsyncClient):
    await auth_client.post("/api/v1/diary", json={
        "content": "工作相关内容 #工作",
    })

    resp = await auth_client.get("/api/v1/diary", params={"tag": "工作"})
    assert resp.status_code == 200
