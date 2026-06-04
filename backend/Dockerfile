FROM node:18-alpine AS builder

WORKDIR /usr/src/app

COPY backend/package*.json ./

RUN npm ci --omit=dev

# --- Production image ---
FROM node:18-alpine

# Create non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

WORKDIR /usr/src/app

# Copy node_modules from builder stage
COPY --from=builder /usr/src/app/node_modules ./node_modules

# Copy backend source code
COPY backend/ .

# Copy frontend into the public directory (served as static files)
COPY frontend/ ./public/

# Create required directories with correct ownership
RUN mkdir -p downloads tmp && chown -R appuser:appgroup downloads tmp

ENV NODE_ENV=production

USER appuser

EXPOSE 4000

CMD ["node", "server.js"]
