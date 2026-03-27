from celery import Celery
from app.config import settings

celery_app = Celery(
    "diary_agent",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL.replace("/0", "/1") if "/0" in settings.REDIS_URL else settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    task_time_limit=120,
    task_soft_time_limit=100,
    worker_prefetch_multiplier=1,
    worker_concurrency=2,
    include=[
        "app.tasks.agent_tasks",
        "app.tasks.title_tasks",
        "app.tasks.caption_tasks",
        "app.tasks.retag_tasks",
    ],
)
