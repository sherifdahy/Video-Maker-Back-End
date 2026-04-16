# ═══════════════════════════════════════════════════════════
# Dockerfile for Video Maker Backend - Production Ready
# ═══════════════════════════════════════════════════════════

FROM node:18-alpine

LABEL maintainer="Your Name <your-email@example.com>"
LABEL description="Video Maker Backend - YouTube Video Processor"

# Install system dependencies
# ffmpeg: video processing
# yt-dlp: video downloading
# python3 & py3-pip: for yt-dlp
RUN apk add --no-cache \
    ffmpeg \
    python3 \
    py3-pip \
    curl \
    && pip3 install --break-system-packages --no-cache-dir yt-dlp

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node dependencies (production only)
RUN npm ci --only=production && \
    npm cache clean --force

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p tmp output uploads && \
    chmod -R 755 tmp output uploads

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Expose port
EXPOSE 3001

# Environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

# Start server
CMD ["node", "server.js"]
