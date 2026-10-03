FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json tsconfig.base.json ./
COPY artifacts ./artifacts
COPY lib ./lib
COPY scripts ./scripts
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @workspace/lunavo build
RUN pnpm --filter @workspace/api-server build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000
RUN useradd --create-home --uid 10001 lunavo
COPY --from=build --chown=lunavo:lunavo /app/node_modules ./node_modules
COPY --from=build --chown=lunavo:lunavo /app/artifacts ./artifacts
COPY --from=build --chown=lunavo:lunavo /app/lib ./lib
COPY --from=build --chown=lunavo:lunavo /app/package.json ./package.json
COPY --from=build --chown=lunavo:lunavo /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN mkdir -p /data/lunavo && chown -R lunavo:lunavo /data/lunavo
USER lunavo
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:5000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","--enable-source-maps","artifacts/api-server/dist/index.mjs"]
