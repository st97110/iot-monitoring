# Docker build context 必須是 repo 根目錄（不是 backend/），
# 才能同時 COPY backend/ 與 shared/。
# GitHub Actions 也要改成 `docker build -f backend/Dockerfile .`

# --- build stage ---
FROM node:20-bookworm AS build
WORKDIR /build

# 維持 repo 的目錄結構：/build/{backend, shared}，tsconfig.json 的 rootDir=".." 才能正確定位
COPY backend/package.json backend/package-lock.json backend/tsconfig.json ./backend/
COPY backend/src ./backend/src
COPY shared ./shared

WORKDIR /build/backend
RUN npm install

RUN npm run build
# 產出位置：/build/backend/dist/{backend/src, shared}

# --- production stage ---
FROM node:20-bookworm
WORKDIR /app

RUN useradd -m app

COPY --from=build /build/backend/package*.json ./
RUN npm ci --omit=dev
COPY --from=build /build/backend/dist ./dist

RUN mkdir -p /app/dist/backend/src/logs && chown -R app:app /app

USER app
EXPOSE 3000
HEALTHCHECK CMD curl -f http://localhost:3000/ || exit 1
# 因為 rootDir=".." 讓 dist 裡多了一層 backend/src，要用完整路徑啟動
CMD ["node", "dist/backend/src/server.js"]
