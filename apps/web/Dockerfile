FROM node:20-alpine AS base
RUN corepack enable pnpm

FROM base AS builder
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY packages ./packages
COPY apps/web ./apps/web

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @syncbytes/crdt build
ENV STANDALONE=true
RUN pnpm --filter @syncbytes/web build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
