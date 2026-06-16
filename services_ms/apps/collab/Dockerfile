# ── Stage 1: Build source code ──────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# Copy package configuration files
COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma/

# Install dependencies and generate Prisma Client
RUN npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retries 5 && \
    npm ci
RUN npx prisma generate

# Copy source files
COPY apps ./apps/
COPY libs ./libs/

# Compile the Collab app to JS
RUN npx nest build collab

# ── Stage 2: Runtime ───────────────────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app

COPY package*.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma/

# Install production dependencies only
RUN npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retries 5 && \
    npm ci --only=production
RUN npx prisma generate

# Copy built app files from builder stage
COPY --from=builder /app/dist/apps/collab ./dist/apps/collab

EXPOSE 3007
CMD ["node", "dist/apps/collab/main"]
