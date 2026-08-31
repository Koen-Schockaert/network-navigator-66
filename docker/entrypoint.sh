#!/bin/sh
# Home Assistant Supervisor mounts add-on options as JSON at /data/options.json.
# When it's present, translate those options into the same env vars a plain
# `docker run` / docker-compose deployment would set directly (NETSCAN_PORT,
# etc. — see docker-compose.yml), then fall through to the normal server
# entrypoint either way.
set -e

OPTIONS_FILE=/data/options.json
if [ -f "$OPTIONS_FILE" ]; then
  port=$(jq -r '.port // empty' "$OPTIONS_FILE")
  subnet=$(jq -r '.default_subnet // empty' "$OPTIONS_FILE")
  interval=$(jq -r '.interval_minutes // empty' "$OPTIONS_FILE")

  [ -n "$port" ] && export NETSCAN_PORT="$port"
  [ -n "$subnet" ] && export NETSCAN_DEFAULT_SUBNET="$subnet"
  [ -n "$interval" ] && [ "$interval" != "0" ] && export NETSCAN_INTERVAL_MINUTES="$interval"
fi

exec node server/index.cjs
