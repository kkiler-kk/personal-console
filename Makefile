.PHONY: docker-up docker-down backend frontend

docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

backend:
	cd backend && go mod tidy && go run cmd/*.go

frontend:
	cd frontend && npm install && npm run dev

build-backend:
	cd backend && CGO_ENABLED=0 go build -o blog cmd/*.go

build-frontend:
	cd frontend && npm install && npm run build
