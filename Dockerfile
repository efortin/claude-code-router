FROM node:20-alpine AS builder

WORKDIR /build

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install pnpm 8.15.9 (matching lockfile version) and dependencies
RUN npm install -g pnpm@8.15.9 && \
    pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN pnpm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install wget for health checks
RUN apk add --no-cache wget

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install pnpm 8.15.9 and production dependencies only
RUN npm install -g pnpm@8.15.9 && \
    pnpm install --prod --frozen-lockfile

# Copy built artifacts from builder
COPY --from=builder /build/dist ./dist

# Create config directory
RUN mkdir -p /root/.claude-code-router

# Expose port
EXPOSE 3456

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3456/health || exit 1

# Start the application
CMD ["node", "dist/cli.js", "start"]
