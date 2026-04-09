.PHONY: up down build logs shell-backend shell-frontend test lint clean

up:
	docker compose up -d

down:
	docker compose down

build:
	docker compose build --no-cache

logs:
	docker compose logs -f

logs-backend:
	docker compose logs -f backend celery_worker

# Run only infrastructure services (for local dev without Docker backend/frontend)
infra:
	docker compose up -d chromadb redis postgres ollama

shell-backend:
	docker compose exec backend bash

shell-frontend:
	docker compose exec frontend sh

shell-postgres:
	docker compose exec postgres psql -U resumeanalyzer -d resumeanalyzer

# Local dev — run backend without Docker
dev-backend:
	cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

dev-worker:
	cd backend && celery -A app.core.celery_app worker --loglevel=info

dev-frontend:
	cd frontend && npm run dev

# Tests
test:
	cd backend && python -m pytest tests/ -v --cov=app

test-unit:
	cd backend && python -m pytest tests/unit/ -v

test-integration:
	cd backend && python -m pytest tests/integration/ -v

# Lint
lint:
	cd backend && ruff check app/
	cd frontend && npx tsc --noEmit

# Smoke test — requires all services running
smoke:
	@echo "Health check..."
	curl -sf http://localhost/api/v1/health | python -m json.tool
	@echo "\nChromaDB heartbeat..."
	curl -sf http://localhost:8001/api/v1/heartbeat
	@echo "\nOllama tags..."
	curl -sf http://localhost:11434/api/tags | python -m json.tool

clean:
	docker compose down -v
	rm -rf volumes/
	find backend -type d -name __pycache__ -exec rm -rf {} +
	find backend -name "*.pyc" -delete
