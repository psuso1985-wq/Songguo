FROM node:22.14.0-alpine AS build
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN --mount=type=secret,id=proxy_ca,required=false \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm_config_https_proxy="${HTTPS_PROXY:-}" npm_config_proxy="${HTTP_PROXY:-}" npm ci --ignore-scripts
COPY web/ ./
RUN npm run typecheck && npm run build

FROM node:22.14.0-alpine AS production-dependencies
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN --mount=type=secret,id=proxy_ca,required=false \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm_config_https_proxy="${HTTPS_PROXY:-}" npm_config_proxy="${HTTP_PROXY:-}" npm ci --omit=dev --ignore-scripts

FROM node:22.14.0-alpine
ARG APP_COMMIT=unknown
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV APP_COMMIT=${APP_COMMIT}
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# The standalone Next.js trace only includes dependencies it can statically
# discover reachable from web routes; merge the lockfile-pinned production
# dependencies as a defensive backstop for anything it misses.
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY bootstrap/verify-shared-service-identities.mjs ./verify-shared-service-identities.mjs
EXPOSE 3000
CMD ["node", "server.js"]
