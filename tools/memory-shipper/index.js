#!/usr/bin/env node
'use strict';

// Ships the bot's telemetry to SigNoz by reading the private server's database.
//
//   node tools/memory-shipper/index.js
//
// Why not tail the logs? Screeps runs bot code in a sandboxed VM with no network
// access, so the bot cannot post anywhere itself. The usual escape hatch is
// `log_console = true`, which forwards console output to a file — but this
// server is launched by Steam, so that output goes to the launcher process's
// stdout and the GUI swallows it. Nothing tailable is ever written.
//
// Memory does reach disk: the server flushes it into db.json about every 10s.
// The bot keeps a bounded ring buffer at Memory.telemetry, and this process
// reads it from there. See tools/log-shipper for the log-tailing variant, which
// works on servers that do forward console output.
//
// Env:
//   SIGNOZ_OTLP_URL  OTLP logs endpoint. Resolve via `portctl resolve signoz` or
//                    `docker port personal-signoz-otel-collector 4318`.
//   SCREEPS_USER     Username whose telemetry to ship (default "Jin").
//   SCREEPS_DB       Path to the server's db.json.
//   POLL_MS          Poll interval (default 5000).

const fs = require('node:fs');
const path = require('node:path');

const HOME = process.env.HOME || '';
const DB_PATH =
  process.env.SCREEPS_DB ||
  path.join(HOME, '.steam/debian-installation/steamapps/common/Screeps/server/db.json');
const OTLP_URL = process.env.SIGNOZ_OTLP_URL || 'http://localhost:17818/v1/logs';
const USERNAME = process.env.SCREEPS_USER || 'Jin';
const POLL_MS = Number(process.env.POLL_MS || 5000);

const SERVICE_NAME = 'screeps';
const ENVIRONMENT = 'pserver';
const SEVERITY = { DEBUG: 5, INFO: 9, WARN: 13, ERROR: 17 };

// Records are keyed by tick; anything at or below this has already been sent.
let lastTick = -1;
let lastSize = -1;

function readTelemetry() {
  const stat = fs.statSync(DB_PATH);
  // db.json is rewritten wholesale on each flush; skip the parse if unchanged.
  if (stat.size === lastSize) return null;
  lastSize = stat.size;

  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  const col = name => (db.collections.find(c => c.name === name) || {}).data || [];

  const user = col('users').find(u => u.username === USERNAME);
  if (!user) throw new Error(`no such user: ${USERNAME}`);

  const env = col('env')[0];
  const raw = env && env.data && env.data['memory:' + user._id];
  if (!raw) return [];

  let memory;
  try {
    memory = JSON.parse(raw);
  } catch {
    return []; // mid-flush torn write; the next poll will pick it up
  }
  return Array.isArray(memory.telemetry) ? memory.telemetry : [];
}

function toAttributes(record) {
  const attrs = [];
  for (const [key, value] of Object.entries(record)) {
    if (key === 'level') continue;
    attrs.push({
      key,
      value:
        typeof value === 'number'
          ? { doubleValue: value }
          : { stringValue: typeof value === 'string' ? value : JSON.stringify(value) },
    });
  }
  return attrs;
}

async function ship(records) {
  if (records.length === 0) return;
  const now = Date.now();
  const payload = {
    resourceLogs: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: SERVICE_NAME } },
            { key: 'deployment.environment', value: { stringValue: ENVIRONMENT } },
          ],
        },
        scopeLogs: [
          {
            scope: { name: 'screeps-memory-shipper' },
            logRecords: records.map((r, i) => ({
              // Game ticks are not wall-clock; stamp on arrival, preserving order.
              timeUnixNano: String((now + i) * 1000000),
              severityNumber: SEVERITY[r.level] || SEVERITY.INFO,
              severityText: r.level || 'INFO',
              body: { stringValue: JSON.stringify(r) },
              attributes: toAttributes(r),
            })),
          },
        ],
      },
    ],
  };

  const res = await fetch(OTLP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    console.error(`[memory-shipper] OTLP ${res.status}: ${await res.text()}`);
    return;
  }
  console.error(`[memory-shipper] shipped ${records.length} record(s), through tick ${lastTick}`);
}

async function poll() {
  let records;
  try {
    records = readTelemetry();
  } catch (err) {
    console.error('[memory-shipper] read failed:', err.message);
    return;
  }
  if (records === null) return; // db.json unchanged since last poll

  const fresh = records.filter(r => typeof r.tick === 'number' && r.tick > lastTick);
  if (fresh.length === 0) return;

  lastTick = fresh[fresh.length - 1].tick;
  try {
    await ship(fresh);
  } catch (err) {
    console.error('[memory-shipper] send failed:', err.message);
  }
}

console.error(`[memory-shipper] ${DB_PATH} (user ${USERNAME}) -> ${OTLP_URL}, every ${POLL_MS}ms`);
poll();
setInterval(poll, POLL_MS);
