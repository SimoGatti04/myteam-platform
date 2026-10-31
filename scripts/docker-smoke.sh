#!/usr/bin/env bash
set -euo pipefail

echo "=== MYTEAM PLATFORM DOCKER SMOKE TEST ==="

NET_NAME="myteam-smoke-net-$RANDOM"
PG_CONTAINER="myteam-smoke-pg-$RANDOM"
API_CONTAINER="myteam-smoke-api-$RANDOM"
WEB_CONTAINER="myteam-smoke-web-$RANDOM"

cleanup() {
  echo "Cleaning up containers and network..."
  docker rm -f "$WEB_CONTAINER" "$API_CONTAINER" "$PG_CONTAINER" 2>/dev/null || true
  docker network rm "$NET_NAME" 2>/dev/null || true
}
trap cleanup EXIT

echo "1. Creating Docker network $NET_NAME..."
docker network create "$NET_NAME" >/dev/null

echo "2. Starting ephemeral PostgreSQL 16..."
docker run -d --name "$PG_CONTAINER" --network "$NET_NAME" \
  -e POSTGRES_USER=myteam \
  -e POSTGRES_PASSWORD=smokepassword \
  -e POSTGRES_DB=myteam_platform_smoke \
  postgres:16-alpine >/dev/null

echo "Waiting for PostgreSQL to be ready..."
until docker run --rm --network "$NET_NAME" postgres:16-alpine pg_isready -h "$PG_CONTAINER" -U myteam -d myteam_platform_smoke >/dev/null 2>&1; do
  sleep 1
done
echo "PostgreSQL ready."

echo "3. Building Dockerfile.api..."
docker build -f deploy/docker/Dockerfile.api -t myteam-api:smoke . >/dev/null

echo "4. Building Dockerfile.web (staging/production build)..."
docker build -f deploy/docker/Dockerfile.web -t myteam-web:smoke \
  --build-arg VITE_APP_ENV=production \
  --build-arg VITE_ENABLE_DEMO=false \
  --build-arg VITE_LOGTO_ENDPOINT=https://auth.simogatti.it/oidc \
  --build-arg VITE_LOGTO_APP_ID=smoke-app-id \
  --build-arg VITE_LOGTO_API_RESOURCE=https://team-staging.simogatti.it/api . >/dev/null

echo "5. Verifying Non-Root Users..."
API_UID=$(docker run --rm myteam-api:smoke id -u)
echo "API UID: $API_UID"
[ "$API_UID" -eq 1000 ] || { echo "API UID mismatch"; exit 1; }

WEB_UID=$(docker run --rm myteam-web:smoke id -u)
echo "Web UID: $WEB_UID"
[ "$WEB_UID" -eq 101 ] || { echo "Web UID mismatch"; exit 1; }

echo "6. Verifying Compiled Entrypoints & SQL Migrations..."
docker run --rm myteam-api:smoke test -f apps/api/dist/index.js || { echo "API index.js missing"; exit 1; }
docker run --rm myteam-api:smoke test -f apps/api/dist/persistence/migrate-cli.js || { echo "API migrate-cli.js missing"; exit 1; }
docker run --rm myteam-api:smoke ls -la db/migrations/0001-platform-core.sql >/dev/null

echo "7. Running Migrations on Ephemeral PostgreSQL 16..."
docker run --rm --network "$NET_NAME" \
  -e DATABASE_URL="postgresql://myteam:smokepassword@$PG_CONTAINER:5432/myteam_platform_smoke" \
  myteam-api:smoke node apps/api/dist/persistence/migrate-cli.js

echo "8. Verifying API Server /health..."
docker run -d --name "$API_CONTAINER" --network "$NET_NAME" \
  -e NODE_ENV="production" \
  -e HOST="0.0.0.0" \
  -e PORT="3000" \
  -e DATABASE_URL="postgresql://myteam:smokepassword@$PG_CONTAINER:5432/myteam_platform_smoke" \
  myteam-api:smoke >/dev/null

sleep 2
HEALTH_JSON=$(docker run --rm --network "$NET_NAME" curlimages/curl:8.10.1 -s http://"$API_CONTAINER":3000/health)
echo "API Health: $HEALTH_JSON"
echo "$HEALTH_JSON" | grep -q '"status":"ok"' || { echo "API /health check failed"; exit 1; }

echo "9. Verifying Web Nginx SPA & Cache Headers..."
docker run -d --name "$WEB_CONTAINER" --network "$NET_NAME" myteam-web:smoke >/dev/null
sleep 1

# Check /
ROOT_HEADERS=$(docker run --rm --network "$NET_NAME" curlimages/curl:8.10.1 -sI http://"$WEB_CONTAINER":8080/)
echo "$ROOT_HEADERS" | grep -i "cache-control: no-cache" || { echo "Root no-cache failed"; exit 1; }

# Check SPA rewrite
SPA_HEADERS=$(docker run --rm --network "$NET_NAME" curlimages/curl:8.10.1 -sI http://"$WEB_CONTAINER":8080/teams/ac-milan)
echo "$SPA_HEADERS" | grep -i "HTTP/1.1 200 OK" || { echo "SPA status failed"; exit 1; }
echo "$SPA_HEADERS" | grep -i "cache-control: no-cache" || { echo "SPA no-cache failed"; exit 1; }

# Check immutable static asset
ASSET_JS=$(docker exec "$WEB_CONTAINER" ls /usr/share/nginx/html/assets | grep '\.js$' | head -n 1)
ASSET_HEADERS=$(docker run --rm --network "$NET_NAME" curlimages/curl:8.10.1 -sI http://"$WEB_CONTAINER":8080/assets/"$ASSET_JS")
echo "$ASSET_HEADERS" | grep -i "immutable" || { echo "Asset immutable failed"; exit 1; }

echo "=== ALL DOCKER SMOKE CHECKS PASSED SUCCESSFULLY ==="
