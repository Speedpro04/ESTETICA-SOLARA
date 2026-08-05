# ── Stage 1: Build ─────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci --frozen-lockfile

COPY . .
RUN npm run build

# ── Stage 2: Serve with Caddy ───────────────────────────────────
FROM caddy:2-alpine

WORKDIR /app

# Copy built assets
COPY --from=build /app/dist /app/dist

# Copy Caddy config
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 80
EXPOSE 443
