FROM node:24.6.0 AS builder

WORKDIR /app

# Copy dependency files
COPY package.json package-lock.json ./

# Copy prisma schema BEFORE install
COPY prisma ./prisma

# Install ALL dependencies including devDependencies
RUN npm install

# Prisma generate (build-time)
RUN npx prisma generate

# Copy full source
COPY . .

# Generate Prisma client
RUN npm run postinstall

# Build TypeScript
RUN npm run build

# Runtime commands (IMPORTANT)
CMD sh -c "npx prisma db push && npm run merge:prisma && npx prisma db seed && node dist/src/server.js"