FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
RUN npm ci

# Install missing dependency
RUN npm install class-variance-authority

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Ensure public directory exists
RUN mkdir -p ./public

# Set environment variables with build-time defaults
ARG OPENAI_API_BASE_URL
ENV OPENAI_API_BASE_URL=$OPENAI_API_BASE_URL
ARG OPENAI_API_KEY
ENV OPENAI_API_KEY=$OPENAI_API_KEY
ARG MODEL_NAME
ENV MODEL_NAME=$MODEL_NAME

# Build the application
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Create public directory if it doesn't exist
RUN mkdir -p ./public
# Set proper permissions
RUN chown -R nextjs:nodejs ./public

# Switch to non-root user
USER nextjs

# Copy necessary files from builder
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Set environment variables with runtime defaults
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# Expose the port the app will run on
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]