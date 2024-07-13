FROM oven/bun:latest as build
WORKDIR /build/app
COPY api/package.json api/bun.lockb ./
COPY lib ../lib
RUN cd ../lib && bun install --frozen-lockfile && bun run build
RUN bun install --frozen-lockfile
COPY ./api .
RUN bun run build

FROM oven/bun:latest as prod
WORKDIR /app/api
COPY --from=build /build/app/package.json /build/app/bun.lockb ./
COPY --from=build /build/app/dist ./dist
COPY --from=build /build/lib ../lib
RUN bun install --production --frozen-lockfile
CMD ["bun", "start"]
