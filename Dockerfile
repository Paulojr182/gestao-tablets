# Dockerfile for Dokploy deployment
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy server package configuration
COPY server/package*.json ./server/
RUN cd server && npm install --production

# Copy dashboard package configuration
COPY dashboard/package*.json ./dashboard/
RUN cd dashboard && npm install

# Copy source codes
COPY server/ ./server/
COPY dashboard/ ./dashboard/

# Build dashboard frontend assets
RUN cd dashboard && npm run build

# Expose API and WebSocket Port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Run server
CMD ["node", "server/src/server.js"]
