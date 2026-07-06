.PHONY: help dev build start stop logs clean \
        install setup infra infra-down db engine app worker stack

# ── Help ──────────────────────────────────────────────────────────────────────
help:
	@echo "OmniTask AI — commands"
	@echo ""
	@echo "  First-time setup"
	@echo "    make setup      - install all deps (node+python+chromium), start infra, push DB"
	@echo "    make install    - install node + python deps + chromium only"
	@echo ""
	@echo "  Run locally (dev)"
	@echo "    make stack      - start infra + backend + frontend + worker + python engine (all-in-one)"
	@echo "    make infra      - start Postgres + Redis only (background)"
	@echo "    make app        - backend + frontend + worker (turbo, foreground)"
	@echo "    make engine     - python browser engine only (foreground)"
	@echo "    make worker     - legacy queue worker only"
	@echo "    make db         - push prisma schema to Postgres"
	@echo "    make infra-down - stop Postgres + Redis"
	@echo ""
	@echo "  Docker (full containerized)"
	@echo "    make dev        - docker compose up (infra in foreground)"
	@echo "    make build      - build production images"
	@echo "    make start      - start production environment"
	@echo "    make stop       - stop all containers"
	@echo "    make logs       - view logs"
	@echo "    make clean      - remove all containers and volumes (WIPES DB)"

# ── First-time setup ──────────────────────────────────────────────────────────
install:
	pnpm install
	pip install -r apps/browser-py/requirements.txt
	python -m playwright install chromium

setup: install infra db
	@echo "Setup complete. Run 'make stack' to launch everything."

# ── Local dev ─────────────────────────────────────────────────────────────────
infra:
	docker compose up -d postgres redis

infra-down:
	docker compose stop postgres redis

db:
	pnpm db:push

app:
	pnpm dev

engine:
	python apps/browser-py/main.py

worker:
	pnpm dev:worker

# Start infra (background) then run the TS apps + the Python engine together.
# Ctrl-C stops everything (kill 0 nukes the whole process group).
stack:
	docker compose up -d postgres redis
	@echo "Infra up. Starting backend + frontend + worker + python engine... (Ctrl-C to stop all)"
	@trap 'kill 0' INT TERM EXIT; \
	pnpm dev & \
	python apps/browser-py/main.py & \
	wait

# ── Docker (full containerized) ───────────────────────────────────────────────
dev:
	docker-compose up

build:
	docker-compose -f docker-compose.prod.yml build

start:
	docker-compose -f docker-compose.prod.yml up -d

stop:
	docker-compose down
	docker-compose -f docker-compose.prod.yml down

logs:
	docker-compose logs -f

clean:
	docker-compose down -v
	docker-compose -f docker-compose.prod.yml down -v
	docker system prune -af
