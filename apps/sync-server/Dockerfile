FROM node:20-alpine AS base
RUN corepack enable pnpm

FROM base AS builder
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY packages ./packages
COPY apps/sync-server ./apps/sync-server

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @syncbytes/crdt build
RUN pnpm --filter @syncbytes/sync-server build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/sync-server/package.json ./apps/sync-server/package.json
COPY --from=builder /app/apps/sync-server/dist ./apps/sync-server/dist
COPY --from=builder /app/apps/sync-server/node_modules ./apps/sync-server/node_modules

EXPOSE 4000
CMD ["node", "apps/sync-server/dist/server.js"]
