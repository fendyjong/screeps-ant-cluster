# log-shipper

Forwards the bot's `[ANT]` telemetry from the Screeps private server to SigNoz.

Screeps runs user code in a sandboxed VM with no network access, so the bot
cannot post to SigNoz itself. It logs JSON to the console instead; the server
writes that to disk, and this process tails it.

## Prerequisites

1. `.screepsrc` must have `log_console = true` (requires a server restart).
2. SigNoz OTLP endpoint. Resolve rather than hardcode:

```bash
portctl resolve signoz
```

## Run

```bash
SIGNOZ_OTLP_URL=http://localhost:17818/v1/logs \
  node tools/log-shipper/index.js \
  ~/.steam/debian-installation/steamapps/common/Screeps/server/logs/engine_runner1.log
```

Which log file receives user console output is **not yet confirmed** — try
`engine_runner1.log` first, then `engine_main.log`. See the design spec.

## Verify

In SigNoz, filter logs by `service.name = screeps`.
