.PHONY: dev build start stop logs clean help

help:
	@echo "OmniTask AI - Docker Commands"
	@echo ""
	@echo "  make dev     - Start development environment"
	@echo "  make build   - Build production images"
	@echo "  make start   - Start production environment"
	@echo "  make stop    - Stop all containers"
	@echo "  make logs    - View logs"
	@echo "  make clean   - Remove all containers and volumes"

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