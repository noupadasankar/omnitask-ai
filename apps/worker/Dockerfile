FROM node:20-alpine AS base
RUN apk add --no-cache python3 make g++ chromium chromium-chromedriver
WORKDIR /app

FROM base AS builder
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker/package.json ./apps/worker/
RUN pnpm install --frozen-lockfile
COPY apps/worker .
RUN npx playwright install chromium

FROM base AS development
RUN npm install -g pnpm
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/worker ./apps/worker
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
CMD ["pnpm", "--filter", "worker", "dev"]

FROM base AS production
ENV NODE_ENV=production
RUN npm install -g pnpm
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/worker ./apps/worker
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
CMD ["pnpm", "--filter", "worker", "start"]