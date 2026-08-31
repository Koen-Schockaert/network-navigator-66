# ---------- build the static UI ----------
FROM node:22-alpine AS build
WORKDIR /build

COPY package*.json ./
RUN npm install --no-audit --no-fund

COPY app ./app
COPY src ./src
COPY vite.app.config.mts tsconfig.json ./
RUN npx vite build --config vite.app.config.mts

# ---------- runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app

# iputils gives a real ping binary; arp-scan style discovery uses the kernel ARP
# table; jq lets the entrypoint read Home Assistant Supervisor's options.json
RUN apk add --no-cache iputils net-tools jq

COPY core ./core
COPY server ./server
COPY docker/entrypoint.sh ./entrypoint.sh
COPY --from=build /build/dist-app ./dist-app
RUN chmod +x ./entrypoint.sh

ENV NODE_ENV=production \
    NETSCAN_PORT=8099 \
    NETSCAN_HOST=0.0.0.0 \
    NETSCAN_DATA_DIR=/data \
    NETSCAN_STATIC_DIR=/app/dist-app

VOLUME ["/data"]
EXPOSE 8099

CMD ["./entrypoint.sh"]
