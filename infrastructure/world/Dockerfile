FROM node:22-bookworm-slim AS builder

ARG WORLD_PACKAGE

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    WORLD_PACKAGE=${WORLD_PACKAGE}

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.19.0 --activate

RUN case "${WORLD_PACKAGE}" in world-api|world-matchmaking) ;; *) echo "Unsupported WORLD_PACKAGE: ${WORLD_PACKAGE}" >&2; exit 1 ;; esac

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/world-api/package.json packages/world-api/package.json
COPY packages/world-matchmaking/package.json packages/world-matchmaking/package.json
COPY packages/world-shared/package.json packages/world-shared/package.json

RUN pnpm install --prod=false --frozen-lockfile --filter "@cukies/${WORLD_PACKAGE}..."

COPY packages/world-api packages/world-api
COPY packages/world-matchmaking packages/world-matchmaking
COPY packages/world-shared packages/world-shared

RUN pnpm --filter "@cukies/${WORLD_PACKAGE}..." -r run build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

WORKDIR /app

COPY --from=builder /app /app

COPY infrastructure/world/entrypoint.sh /usr/local/bin/world-entrypoint
COPY infrastructure/world/readiness.mjs /usr/local/lib/world/
RUN chmod 0755 /usr/local/bin/world-entrypoint

USER node

ENTRYPOINT ["/usr/local/bin/world-entrypoint"]
