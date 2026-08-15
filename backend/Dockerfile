FROM node:22-bookworm-slim AS dependencies

WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

FROM dependencies AS build

COPY backend/prisma ./prisma
COPY backend/prisma.config.ts backend/tsconfig.json backend/tsconfig.build.json ./
COPY backend/src ./src
COPY backend/scripts ./scripts
COPY docs/backend_spec/contracts /docs/backend_spec/contracts
RUN npm run build

FROM build AS schema

CMD ["sh", "-c", "npm run db:deploy && npm run seed"]

FROM build AS production-dependencies

RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    OPENAPI_CONTRACT_PATH=/docs/openapi.bundle.yaml
WORKDIR /app

COPY --from=production-dependencies /app/node_modules ./node_modules
COPY backend/package.json ./package.json
COPY --from=build /app/dist ./dist
COPY --from=build /docs/backend_spec/contracts/dist/openapi.bundle.yaml /docs/openapi.bundle.yaml

USER node
EXPOSE 3000
CMD ["node", "dist/src/main.js"]
