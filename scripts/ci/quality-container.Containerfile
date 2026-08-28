FROM node:22.19.0-bookworm-slim@sha256:cff78eb5aa1cf27dc2b6aeea9d31366415a43e9a9ea0ddec00d780b2b66fad0f

ARG QUALITY_EXPECTED_SHA

LABEL com.cukies.quality.target-sha=$QUALITY_EXPECTED_SHA

ENV CI=1 \
    NEXT_TELEMETRY_DISABLED=1 \
    NPM_CONFIG_USERCONFIG=/dev/null

RUN corepack enable

WORKDIR /workspace
COPY --chown=node:node . /workspace/
COPY --chown=root:root .quality/source-manifest.json /opt/cukies-quality/source-manifest.json
COPY --chown=root:root .quality/verify-quality-source.mjs /opt/cukies-quality/verify-quality-source.mjs
COPY --chown=root:root .quality/run-quality-gate.mjs /opt/cukies-quality/run-quality-gate.mjs
COPY --chown=root:root .quality/validate-prisma-generator.mjs /opt/cukies-quality/validate-prisma-generator.mjs
RUN chmod -R a-w /opt/cukies-quality

USER node

RUN set -eu; \
    package_manager="$(node -e 'const value = require("./package.json").packageManager; if (typeof value !== "string" || !/^pnpm@[0-9]+\.[0-9]+\.[0-9]+$/.test(value)) process.exit(1); process.stdout.write(value);')"; \
    corepack prepare "$package_manager" --activate; \
    pnpm --version

RUN pnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile

RUN /usr/local/bin/node /opt/cukies-quality/validate-prisma-generator.mjs /workspace/dapp/prisma/schema.prisma
RUN /usr/local/bin/node /opt/cukies-quality/verify-quality-source.mjs /workspace /opt/cukies-quality/source-manifest.json

CMD ["node", "--version"]
