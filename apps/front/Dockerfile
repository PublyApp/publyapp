# Use Node.js 20 Alpine for smaller image size
FROM node:24-alpine AS base

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy workspace configuration files
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml tsconfig.paths.json ./

# Copy package.json files for all workspaces
COPY apps/front/package.json ./apps/front/
COPY packages/shared/package.json ./packages/shared/
COPY packages/js-client/package.json ./packages/js-client/
COPY packages/_tsconfig/package.json ./packages/_tsconfig/

# Install dependencies (including dev dependencies for build)
# Skip postinstall scripts during Docker build to avoid missing source files
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy source code
COPY apps/ ./apps/
COPY packages/ ./packages/

# Copy environment file for build
COPY .env.production ./

# Run postinstall scripts now that source code is available
RUN cd packages/shared && pnpm run postinstall

# Build the application using react-router build
RUN cd apps/front && pnpm run build

# Production stage
FROM node:24-alpine AS production

# Install pnpm
RUN npm install -g pnpm

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

WORKDIR /app

# Copy workspace configuration files
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml tsconfig.paths.json ./

# Copy package.json files for all workspaces
COPY apps/front/package.json ./apps/front/
COPY packages/shared/package.json ./packages/shared/
COPY packages/js-client/package.json ./packages/js-client/
COPY packages/_tsconfig/package.json ./packages/_tsconfig/

# Install only production dependencies as root
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Change ownership of the entire app directory to the non-root user
RUN chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Copy built application and necessary files with correct ownership
COPY --chown=nextjs:nodejs --from=base /app/apps/front/build ./apps/front/build
COPY --chown=nextjs:nodejs --from=base /app/apps/front/server.js ./apps/front/
COPY --chown=nextjs:nodejs --from=base /app/packages ./packages

# Set working directory to frontend
WORKDIR /app/apps/front

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Start the application
CMD ["node", "server.js"]
