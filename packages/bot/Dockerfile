FROM oven/bun:latest AS build
WORKDIR /build

COPY package.json bun.lockb* ./
COPY packages/bot/package.json ./packages/bot/
COPY packages/lib/package.json ./packages/lib/

RUN bun install --frozen-lockfile

COPY packages/lib ./packages/lib
COPY packages/bot ./packages/bot

WORKDIR /build/packages/lib
RUN bun run build

WORKDIR /build/packages/bot
RUN bun run build

FROM oven/bun:latest AS prod
WORKDIR /app
COPY --from=build /build/package.json /build/bun.lockb* ./
COPY --from=build /build/packages/bot/package.json ./packages/bot/
COPY --from=build /build/packages/lib/package.json ./packages/lib/
COPY --from=build /build/packages/bot/dist ./packages/bot/dist
COPY --from=build /build/packages/lib ./packages/lib
RUN bun install --production --frozen-lockfile
WORKDIR /app/packages/bot
CMD ["bun", "start"]
