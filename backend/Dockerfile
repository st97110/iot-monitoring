# --- build stage ---
FROM node:20-bookworm AS build
WORKDIR /app

# 安裝依賴
COPY package*.json tsconfig.json ./
RUN npm ci

# 複製原始碼（現在都集中在 src/）
COPY src ./src

# 編譯 TypeScript -> JavaScript
RUN npm run build

# --- production stage ---
FROM node:20-bookworm
WORKDIR /app

# 建立 app 使用者
RUN useradd -m app

# --- 複製檔案還是用 root ---
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

# <== 在這裡補 logs 目錄並調權限
RUN mkdir -p /app/dist/logs && chown -R app:app /app

# 之後才切身分
USER app
EXPOSE 3000
HEALTHCHECK CMD curl -f http://localhost:3000/ || exit 1
CMD ["node", "dist/server.js"]