FROM node:22.22.0-alpine3.22 AS toolchain

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable \
  && corepack prepare pnpm@10.17.1 --activate

WORKDIR /workspace

FROM toolchain AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/api/package.json packages/api/package.json
COPY packages/tools/package.json packages/tools/package.json

RUN pnpm install --frozen-lockfile

FROM dependencies AS build

COPY tsconfig.base.json tsconfig.json ./
COPY packages/api packages/api

RUN pnpm --filter @bet-processor/api build \
  && pnpm --filter @bet-processor/api deploy --legacy --prod /opt/api

FROM node:22.22.0-alpine3.22 AS runtime

ENV BET_PROCESSOR_HOST=0.0.0.0
ENV BET_PROCESSOR_PORT=3000
ENV NODE_ENV=production

WORKDIR /app

COPY --from=build --chown=node:node /opt/api ./

USER node

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.BET_PROCESSOR_PORT??'3000')+'/health').then(response=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
