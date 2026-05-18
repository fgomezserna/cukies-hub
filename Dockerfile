FROM node:22-bookworm-slim AS app

ARG CUKIES_SERVICE=dapp

ENV NEXT_TELEMETRY_DISABLED=1
ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.19.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY dapp/package.json dapp/package.json
COPY dapp/prisma dapp/prisma
COPY games/hyppie-road/package.json games/hyppie-road/package.json
COPY games/sybil-slayer/package.json games/sybil-slayer/package.json
COPY games/tower-builder/package.json games/tower-builder/package.json
COPY packages/chain-indexer/package.json packages/chain-indexer/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/cuki-card-worker/package.json packages/cuki-card-worker/package.json
COPY packages/game-bridge/package.json packages/game-bridge/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN if [ "$CUKIES_SERVICE" = "dapp" ]; then \
      pnpm --filter dapp build; \
    elif [ "$CUKIES_SERVICE" = "chain-indexer" ]; then \
      pnpm --filter @cukies/chain-indexer run build; \
    elif [ "$CUKIES_SERVICE" = "cuki-card-worker" ]; then \
      pnpm --filter @cukies/cuki-card-worker run build; \
    else \
      echo "CUKIES_SERVICE no soportado: $CUKIES_SERVICE" && exit 1; \
    fi

ENV NODE_ENV=production

EXPOSE 3000

CMD ["sh", "scripts/docker-start.sh"]
