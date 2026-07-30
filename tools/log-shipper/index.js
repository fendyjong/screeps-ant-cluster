#!/usr/bin/env node
'use strict';

// Tails a Screeps private-server log file, keeps the '[ANT]' telemetry lines,
// and forwards them to SigNoz over OTLP/HTTP. No dependencies.
//
//   node tools/log-shipper/index.js /path/to/server/logs/engine_runner1.log
//
// The OTLP endpoint comes from portctl (`portctl resolve signoz`), not a
// hardcoded port. Override with SIGNOZ_OTLP_URL.

const { spawn } = require('node:child_process');
const readline = require('node:readline');

const LOG_FILE = process.argv[2];
const OTLP_URL = process.env.SIGNOZ_OTLP_URL || 'http://localhost:17818/v1/logs';
const SENTINEL = '[ANT]';
const SERVICE_NAME = 'screeps';
const ENVIRONMENT = 'pserver';
const SEVERITY = { DEBUG: 5, INFO: 9, WARN: 13, ERROR: 17 };
const FLUSH_MS = 2000;
const MAX_BATCH = 200;

if (!LOG_FILE) {
  console.error('usage: node index.js <logfile>');
  process.exit(1);
}

let buffer = [];

function toAttributes(obj) {
  const attrs = [];
  for (const [key, value] of Object.entries(obj)) {
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

function toRecord(obj, raw) {
  return {
    timeUnixNano: String(Date.now() * 1000000),
    severityNumber: SEVERITY[obj.level] || SEVERITY.INFO,
    severityText: obj.level || 'INFO',
    body: { stringValue: raw },
    attributes: toAttributes(obj),
  };
}

async function flush() {
  if (buffer.length === 0) return;
  const logRecords = buffer.splice(0, MAX_BATCH);
  const payload = {
    resourceLogs: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: SERVICE_NAME } },
            { key: 'deployment.environment', value: { stringValue: ENVIRONMENT } },
          ],
        },
        scopeLogs: [{ scope: { name: 'screeps-log-shipper' }, logRecords }],
      },
    ],
  };

  try {
    const res = await fetch(OTLP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`[shipper] OTLP ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.error('[shipper] send failed:', err.message);
  }
}

const tail = spawn('tail', ['-n', '0', '-F', LOG_FILE]);
tail.on('error', err => {
  console.error('[shipper] cannot tail:', err.message);
  process.exit(1);
});

readline.createInterface({ input: tail.stdout }).on('line', line => {
  const at = line.indexOf(SENTINEL);
  if (at === -1) return;
  const raw = line.slice(at + SENTINEL.length);
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    return;
  }
  buffer.push(toRecord(obj, raw));
  if (buffer.length >= MAX_BATCH) flush();
});

setInterval(flush, FLUSH_MS);
process.on('SIGINT', () => {
  flush().finally(() => process.exit(0));
});

console.error(`[shipper] tailing ${LOG_FILE} -> ${OTLP_URL}`);
