FROM node:22-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev && npm cache clean --force

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# For admin fixes on the server: fly ssh console -C "sqlite3 /data/app.db"
RUN apt-get update && apt-get install -y --no-install-recommends sqlite3 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 3001
CMD ["node", "dist/server/index.js"]
