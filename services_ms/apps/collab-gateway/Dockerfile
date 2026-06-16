# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./
COPY nest-cli.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY apps/collab-gateway ./apps/collab-gateway
COPY libs ./libs/

# Build
RUN npx nest build collab-gateway

# Stage 2: Production
FROM node:22-alpine AS production
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built app
COPY --from=builder /app/dist/apps/collab-gateway ./dist/apps/collab-gateway

EXPOSE 3008

CMD ["node", "dist/apps/collab-gateway/main"]
