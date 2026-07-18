# ==========================================
# Stage 1: Builder
# ==========================================
FROM node:20.20-alpine AS builder

WORKDIR /app

# Copy package files first for caching
COPY package*.json ./
RUN npm install

# Copy the rest of the source code and build it
COPY . .
RUN npm run build

# ==========================================
# Stage 2: Production Runner
# ==========================================
FROM node:20.20-alpine

WORKDIR /app

# Set environment to production
ENV NODE_ENV=production

# Copy only the package files
COPY package*.json ./

# Install ONLY production dependencies (ignores devDependencies like jest, typescript)
RUN npm install --omit=dev

# Copy the compiled Javascript from the builder stage
COPY --from=builder /app/dist ./dist

# We also need to copy the db folder if we are running migrations in production,
# but for now, the 'dist' folder is the core app.

# Expose the port your app runs on
EXPOSE 3000

# The command to start the app
CMD ["node", "dist/index.js"]
