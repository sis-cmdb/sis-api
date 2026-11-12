# syntax=docker/dockerfile:1

# ---- deps: install production dependencies only ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- runner: assemble the runtime image ----
FROM node:22-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# Production dependencies from the deps stage
COPY --from=deps /app/node_modules ./node_modules

# Application source
COPY . .

# build.json is served by the /info endpoint. Generate it at build time so the
# image reports a stable version/commit instead of a fresh timestamp per boot.
# Pass --build-arg BUILD_NUMBER=... --build-arg GIT_COMMIT_HASH=... in CI.
ARG BUILD_NUMBER=local-build
ARG GIT_COMMIT_HASH=dev-hash
ENV BUILD_NUMBER=$BUILD_NUMBER \
    GIT_COMMIT_HASH=$GIT_COMMIT_HASH
RUN node scripts/gen-build-info.js

# JWT session keys live next to the config but are never baked into the image.
# Create the directory owned by 'node' so a volume mounted here inherits that
# ownership and the server can read its 0600 private key.
RUN mkdir -p /app/conf/keys && chown node:node /app/conf/keys && chmod 700 /app/conf/keys

# Drop privileges to the unprivileged 'node' user that ships with the base image.
USER node

EXPOSE 3000

# server.js installs a graceful-shutdown handler for SIGINT only, so make
# `docker stop` / `podman stop` send SIGINT instead of the default SIGTERM.
STOPSIGNAL SIGINT

# The server only starts listening once Mongo is connected and routes are
# mounted, so a 200 on HEAD / is a true readiness signal.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').request({host:'127.0.0.1',port:3000,method:'HEAD',path:'/'},function(r){process.exit(r.statusCode===200?0:1)}).on('error',function(){process.exit(1)}).end()"

CMD ["node", "server.js"]
