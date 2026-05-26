FROM node:20-alpine AS base
RUN apk add --no-cache python3 make g++
WORKDIR /app

FROM base AS builder
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/config/package.json ./packages/config/
RUN pnpm install --frozen-lockfile
COPY apps/backend .
COPY prisma ./prisma
RUN npx prisma generate

FROM base AS development
RUN npm install -g pnpm
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/backend ./apps/backend
EXPOSE 4000
CMD ["pnpm", "--filter", "backend", "start:dev"]

FROM base AS production
ENV NODE_ENV=production
RUN npm install -g pnpm
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/backend ./apps/backend
COPY --from=builder /app/prisma ./prisma
EXPOSE 4000
CMD ["pnpm", "--filter", "backend", "start:prod"]