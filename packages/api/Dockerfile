FROM oven/bun:latest AS build
WORKDIR /build

COPY package.json bun.lockb* ./
COPY packages/api/package.json ./packages/api/

RUN bun install --frozen-lockfile

COPY packages/api ./packages/api
WORKDIR /build/packages/api
RUN bun run build

FROM oven/bun:latest AS prod
WORKDIR /app
COPY --from=build /build/package.json /build/bun.lockb* ./
COPY --from=build /build/packages/api/package.json ./packages/api/
COPY --from=build /build/packages/api/dist ./packages/api/dist
RUN bun install --production --frozen-lockfile
WORKDIR /app/packages/api
CMD ["bun", "start"]
