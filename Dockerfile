# ── Stage 1: Build ─────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
# `npm ci` já instala exatamente o que está no package-lock. O
# `--frozen-lockfile` que estava aqui é flag de yarn/pnpm, não de npm.
RUN npm ci

COPY . .

# Gera o site PRÉ-RENDERIZADO (vite-react-ssg): o index.html sai com a página
# inteira, não com <div id="root"> vazio. As variáveis VITE_* são embutidas
# neste momento, lidas de .env.production — por isso o arquivo é versionado e
# só carrega valor público (URL da API e chave anon do Supabase).
RUN npm run build

# ── Stage 2: Serve with Caddy ───────────────────────────────────
FROM caddy:2-alpine

WORKDIR /app

# Só o resultado do build vai para a imagem final: nada de código-fonte,
# node_modules ou arquivos de ambiente.
COPY --from=build /app/dist /app/dist

COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 80
EXPOSE 443
