# syntax=docker/dockerfile:1

# ---- deps: install once, cached across builds unless package.json changes
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- build: compile Tailwind CSS with dev dependencies present
FROM deps AS build
WORKDIR /app
COPY . .
RUN npx tailwindcss -i ./src/input.css -o ./public/css/app.css --minify

# ---- runtime: only production deps + built assets, non-root
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN groupadd -r makit && useradd -r -g makit makit

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=build /app/server.js ./server.js
COPY --from=build /app/lib ./lib
COPY --from=build /app/routes ./routes
COPY --from=build /app/public ./public

RUN chown -R makit:makit /app
USER makit

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:8080/healthz').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
