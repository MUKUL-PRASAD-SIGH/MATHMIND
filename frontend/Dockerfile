# MathMind web app. Build from the repo root (the build reads ../shared/contracts):
#   docker build -f frontend/Dockerfile -t mathmind-frontend .
FROM node:20-alpine AS build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY shared /app/shared
COPY frontend ./
# Same-origin API: nginx proxies /api to the backend service, so no CORS and no baked-in host.
ENV VITE_API_BASE_URL="" VITE_USE_MOCKS=false
RUN npm run build

FROM nginx:1.27-alpine
COPY frontend/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
