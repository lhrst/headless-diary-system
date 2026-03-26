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

deploy-to:
	rsync -avz --exclude='.env' --exclude='data/' --exclude='node_modules/' --exclude='.next/' --exclude='__pycache__/' --exclude='.git/' ./ $(SERVER):$(HOST)/
	ssh $(SERVER) "cd $(HOST) && docker compose build && docker compose up -d --force-recreate"
