FROM node:20-alpine

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy application code
COPY . .

# Build (if needed)
# RUN pnpm run build

# Expose port (if using HTTP mode)
EXPOSE 3000

# Run the application
CMD ["pnpm", "dev"]

