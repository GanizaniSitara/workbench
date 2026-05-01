# Build stage: compile TypeScript API
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:api

# Runtime stage: minimal image with production deps only
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist-api ./dist-api
EXPOSE 4000
CMD ["node", "dist-api/server/index.js"]
