"""Retag all diaries with a systematic, hierarchical tag taxonomy."""
import json
import httpx
from celery import current_task

from app.tasks import celery_app
from app.config import settings
from app.database import sync_session_factory
from app.models.diary import DiaryEntry
from app.models.tag import DiaryTag, TagHierarchy

from sqlalchemy import select, delete


def _call_openrouter(messages: list[dict], model: str = None, max_tokens: int = 2000) -> dict:
    if model is None:
        model = settings.LLM_MODEL_SMART
    with httpx.Client(timeout=120, proxy=None) as client:
        response = client.post(
            f"{settings.OPENROUTER_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            json={"model": model, "messages": messages, "max_tokens": max_tokens},
        )
        response.raise_for_status()
        return response.json()


@celery_app.task(bind=True, soft_time_limit=600, time_limit=660)
def retag_all_diaries(self, user_id: str):
    """Two-phase retag: 1) design taxonomy, 2) apply tags + hierarchy."""
    db = sync_session_factory()
    try:
        # Load all diaries
        entries = db.execute(
            select(DiaryEntry)
            .where(DiaryEntry.author_id == user_id, DiaryEntry.raw_text.isnot(None))
            .order_by(DiaryEntry.created_at.desc())
        ).scalars().all()

        if not entries:
            return {"status": "done", "message": "No diaries found", "updated": 0}

        total = len(entries)
        self.update_state(state="PROGRESS", meta={
            "phase": "taxonomy",
            "message": f"正在分析 {total} 篇日记，设计标签体系...",
            "current": 0, "total": total,
        })

        # ── Phase 1: Design taxonomy ──
        # Collect diary summaries (title + first 150 chars)
        summaries = []
        for i, entry in enumerate(entries):
            title = entry.manual_title or entry.auto_title or "(无标题)"
            content = (entry.raw_text or "")[:150].replace("\n", " ")
            summaries.append(f"{i+1}. {title}: {content}")

        summaries_text = "\n".join(summaries)

        taxonomy_prompt = f"""你是一个个人日记标签系统设计专家。以下是一个用户的所有日记摘要：

{summaries_text}

请为这些日记设计一个层次化的标签体系。要求：
1. 设计 2-5 个一级标签（大分类），每个一级标签下设计 2-6 个二级标签
2. 标签名 2-4 个字，简洁有意义
3. 体系要覆盖所有日记的主题
4. 标签之间不要重叠，每篇日记应该能被 1-3 个标签分类
5. 偏向实用的分类，不要太抽象

请用 JSON 格式输出，格式如下：
{{
  "taxonomy": {{
    "一级标签名": ["二级标签1", "二级标签2", ...],
    "一级标签名": ["二级标签1", "二级标签2", ...]
  }}
}}

只输出 JSON，不要其他内容。"""

        resp = _call_openrouter(
            [{"role": "user", "content": taxonomy_prompt}],
            model=settings.LLM_MODEL_SMART,
            max_tokens=1000,
        )
        taxonomy_raw = resp["choices"][0]["message"]["content"].strip()

        # Parse taxonomy JSON (handle markdown code blocks)
        if "```" in taxonomy_raw:
            taxonomy_raw = taxonomy_raw.split("```")[1]
            if taxonomy_raw.startswith("json"):
                taxonomy_raw = taxonomy_raw[4:]
            taxonomy_raw = taxonomy_raw.strip()

        taxonomy_data = json.loads(taxonomy_raw)
        taxonomy = taxonomy_data.get("taxonomy", taxonomy_data)

        # Build flat tag list for the tagging prompt
        all_tags = []
        for parent, children in taxonomy.items():
            all_tags.append(parent)
            all_tags.extend(children)
        all_tags_str = ", ".join(all_tags)

        self.update_state(state="PROGRESS", meta={
            "phase": "tagging",
            "message": f"标签体系设计完成（{len(all_tags)} 个标签），开始重新标记日记...",
            "current": 0, "total": total,
            "taxonomy": taxonomy,
        })

        # ── Phase 2: Clear old AI tags and retag ──
        # Delete all AI-generated tags for this user
        ai_tag_ids = db.execute(
            select(DiaryTag.id)
            .join(DiaryEntry, DiaryTag.entry_id == DiaryEntry.id)
            .where(DiaryEntry.author_id == user_id, DiaryTag.is_ai == True)
        ).scalars().all()

        if ai_tag_ids:
            db.execute(delete(DiaryTag).where(DiaryTag.id.in_(ai_tag_ids)))
            db.flush()

        # Delete old hierarchy for this user
        db.execute(delete(TagHierarchy).where(TagHierarchy.user_id == user_id))
        db.flush()

        # Batch tag diaries (process in groups of 5 for efficiency)
        updated = 0
        batch_size = 5

        for batch_start in range(0, total, batch_size):
            batch_entries = entries[batch_start:batch_start + batch_size]

            # Build batch prompt
            batch_items = []
            for entry in batch_entries:
                title = entry.manual_title or entry.auto_title or "(无标题)"
                content = (entry.raw_text or "")[:500].replace("\n", " ")
                batch_items.append(f"[ID:{entry.id}] {title}: {content}")

            batch_text = "\n---\n".join(batch_items)

            tag_prompt = f"""为以下日记分配标签。只能使用这些标签：{all_tags_str}

每篇日记分配 1-3 个最匹配的标签。优先使用二级标签，必要时可加一级标签。

日记：
{batch_text}

用 JSON 格式输出，格式如下：
{{
  "结果": [
    {{"id": "日记ID", "tags": ["标签1", "标签2"]}},
    ...
  ]
}}

只输出 JSON，不要其他内容。"""

            try:
                resp = _call_openrouter(
                    [{"role": "user", "content": tag_prompt}],
                    model=settings.LLM_MODEL_FAST,
                    max_tokens=500,
                )
                result_raw = resp["choices"][0]["message"]["content"].strip()

                if "```" in result_raw:
                    result_raw = result_raw.split("```")[1]
                    if result_raw.startswith("json"):
                        result_raw = result_raw[4:]
                    result_raw = result_raw.strip()

                result_data = json.loads(result_raw)
                assignments = result_data.get("结果", result_data.get("results", []))

                for item in assignments:
                    entry_id = str(item.get("id", ""))
                    item_tags = item.get("tags", [])
                    # Validate tags are in taxonomy
                    valid_tags = [t.strip() for t in item_tags if t.strip() in all_tags][:3]
                    for tag_name in valid_tags:
                        db.add(DiaryTag(entry_id=entry_id, tag=tag_name, is_ai=True))
                    if valid_tags:
                        updated += 1
            except Exception as e:
                # Log but continue
                print(f"Batch tagging error: {e}")

            db.flush()

            self.update_state(state="PROGRESS", meta={
                "phase": "tagging",
                "message": f"已标记 {min(batch_start + batch_size, total)}/{total} 篇日记...",
                "current": min(batch_start + batch_size, total),
                "total": total,
                "taxonomy": taxonomy,
            })

        # ── Phase 3: Set hierarchy ──
        for parent_tag, children in taxonomy.items():
            for child_tag in children:
                db.add(TagHierarchy(
                    user_id=user_id,
                    parent_tag=parent_tag,
                    child_tag=child_tag,
                ))

        db.commit()

        return {
            "status": "done",
            "message": f"完成！重新标记了 {updated}/{total} 篇日记",
            "updated": updated,
            "total": total,
            "taxonomy": taxonomy,
        }
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()
