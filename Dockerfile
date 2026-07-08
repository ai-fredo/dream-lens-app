FROM node:22-alpine

WORKDIR /app

# Install with the root lockfile; only manifests first for layer caching.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --omit=dev --workspace apps/api --include-workspace-root=false

# App source (mobile app and tests are excluded via .dockerignore).
COPY apps/api apps/api
COPY packages/shared packages/shared

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start", "--workspace", "apps/api"]
