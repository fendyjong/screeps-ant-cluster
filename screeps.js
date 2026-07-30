"use strict";

// No dotenv dependency installed — load .env manually (shell-exported vars still win).
try {
    const fs = require("fs");
    const path = require("path");
    const envPath = path.join(__dirname, ".env");
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    }
} catch (e) { /* no .env file — fine, rely on real env vars */ }

const screepsConfig = {
    main: {
        token: process.env.SCREEPS_TOKEN,
        protocol: "https",
        hostname: "screeps.com",
        port: 443,
        path: "/",
        branch: "default"
    },
    seasonal: {
        token: process.env.SCREEPS_TOKEN,
        protocol: "https",
        hostname: "screeps.com",
        port: 443,
        path: "/season",
        branch: "main"
    },
    // NOT usable: this private server is Steam-launched, which only accepts Steam
    // client tickets — no email/password or API token auth is possible against it
    // (confirmed: screeps.com/forum/topic/539/pushing-code/13). `push-pserver` will
    // fail no matter what's filled in here. Use `npm run deploy` instead — it copies
    // dist/main.js straight into 127_0_0_1___21025/pserver/, which the Steam client
    // syncs on its own (the documented approach for Steam-auth'd servers).
    pserver: {
        email: "unused-steam-auth-only",
        password: "unused-steam-auth-only",
        protocol: "http",
        hostname: "127.0.0.1",
        port: 21025,
        path: "/",
        branch: "default"
    },
    screepsplus: {
        token: process.env.SCREEPS_TOKEN,
        protocol: "https",
        hostname: "screepsplus.com",
        port: 443,
        path: "/",
        branch: "default"
    }
};

module.exports = screepsConfig;