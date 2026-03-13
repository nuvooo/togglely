.PHONY: build up down logs shell-be shell-fe migrate seed test

# Build all services
build:
	docker-compose build

# Start all services
up:
	docker-compose up -d

# Stop all services
down:
	docker-compose down

# View logs
logs:
	docker-compose logs -f

# Backend shell
shell-be:
	docker-compose exec backend sh

# Frontend shell
shell-fe:
	docker-compose exec frontend sh

# Database migrations
migrate:
	docker-compose exec backend npx prisma migrate deploy

# Seed database
seed:
	docker-compose exec backend npx prisma db seed

# Run tests
test:
	docker-compose exec backend npm test

# Reset everything (DANGER: removes all data!)
reset:
	docker-compose down -v
	docker-compose up -d --build
