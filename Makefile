.PHONY: dev prod stop logs migrate seed test backup

dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

prod:
	docker compose up -d --build

stop:
	docker compose down

logs:
	docker compose logs -f

logs-api:
	docker compose logs -f api celery-worker

migrate:
	docker compose exec api alembic upgrade head

migration:
	docker compose exec api alembic revision --autogenerate -m "$(msg)"

seed:
	docker compose exec api python -m app.seed

test:
	docker compose exec api pytest -v

backup:
	tar -czf backup-$(shell date +%Y%m%d).tar.gz data/

backup-light:
	docker compose exec postgres pg_dump -U diary_user diary > backup-db.sql
	tar -czf backup-light-$(shell date +%Y%m%d).tar.gz data/diaries/ backup-db.sql
	rm backup-db.sql

REMOTE = lhrst@8.145.43.198
REMOTE_DIR = /home/lhrst/projects/diary
RSYNC_EXCLUDE = --exclude='.env' --exclude='data/' --exclude='node_modules/' \
	--exclude='.next/' --exclude='__pycache__/' --exclude='.git/' \
	--exclude='.venv/' --exclude='.playwright-mcp/' --exclude='.claude/'

deploy-to:
	rsync -avz $(RSYNC_EXCLUDE) ./ $(SERVER):$(HOST)/
	ssh $(SERVER) "cd $(HOST) && docker compose build && docker compose up -d --force-recreate"

## Quick deploy: rsync → stop → build web → restart (avoids OOM on 1.6G server)
deploy:
	@echo "==> Syncing files..."
	rsync -avz $(RSYNC_EXCLUDE) ./ $(REMOTE):$(REMOTE_DIR)/
	@echo "==> Stopping web+nginx to free memory for build..."
	ssh $(REMOTE) "cd $(REMOTE_DIR) && docker compose stop web nginx celery-worker"
	@echo "==> Building web image..."
	ssh $(REMOTE) "cd $(REMOTE_DIR) && docker compose build web"
	@echo "==> Starting all services..."
	ssh $(REMOTE) "cd $(REMOTE_DIR) && docker compose up -d"
	@echo "==> Verifying..."
	ssh $(REMOTE) "docker compose -f $(REMOTE_DIR)/docker-compose.yml exec web env | grep NEXT_PUBLIC"
	@echo "==> Done! Site: http://8.145.43.198"

## Full deploy: rebuild all services (stops everything first to avoid OOM)
deploy-all:
	@echo "==> Syncing files..."
	rsync -avz $(RSYNC_EXCLUDE) ./ $(REMOTE):$(REMOTE_DIR)/
	@echo "==> Stopping services to free memory for build..."
	ssh $(REMOTE) "cd $(REMOTE_DIR) && docker compose stop web nginx celery-worker api"
	@echo "==> Building images one by one..."
	ssh $(REMOTE) "cd $(REMOTE_DIR) && docker compose build web && docker compose build api"
	@echo "==> Starting all services..."
	ssh $(REMOTE) "cd $(REMOTE_DIR) && docker compose up -d --force-recreate"
	@echo "==> Verifying..."
	ssh $(REMOTE) "docker compose -f $(REMOTE_DIR)/docker-compose.yml exec web env | grep NEXT_PUBLIC"
	@echo "==> Done! Site: http://8.145.43.198"

## Deploy API only (backend changes)
deploy-api:
	@echo "==> Syncing files..."
	rsync -avz $(RSYNC_EXCLUDE) ./ $(REMOTE):$(REMOTE_DIR)/
	@echo "==> Stopping api+celery for build..."
	ssh $(REMOTE) "cd $(REMOTE_DIR) && docker compose stop api celery-worker"
	@echo "==> Building api + celery-worker images..."
	ssh $(REMOTE) "cd $(REMOTE_DIR) && docker compose build api celery-worker"
	@echo "==> Starting all services..."
	ssh $(REMOTE) "cd $(REMOTE_DIR) && docker compose up -d --force-recreate api celery-worker nginx"
	@echo "==> Done!"
