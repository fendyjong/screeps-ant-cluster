"use strict";

const screepsConfig = {
    main: {
        token: "YOUR_TOKEN_HERE",
        protocol: "https",
        hostname: "screeps.com",
        port: 443,
        path: "/",
        branch: "default"
    },
    seasonal: {
        token: "YOUR_TOKEN_HERE",
        protocol: "https",
        hostname: "screeps.com",
        port: 443,
        path: "/season",
        branch: "main"
    },
    pserver: {
        email: "username",
        password: "password",
        protocol: "http",
        hostname: "127.0.0.1",
        port: 21025,
        path: "/",
        branch: "default"
    },
    screepsplus: {
        token: "YOUR_TOKEN_HERE",
        protocol: "https",
        hostname: "screepsplus.com",
        port: 443,
        path: "/",
        branch: "default"
    }
};

module.exports = screepsConfig;