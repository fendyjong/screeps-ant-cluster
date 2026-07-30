"use strict";

import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from "rollup-plugin-typescript2";
import screeps from "rollup-plugin-screeps";

let cfg;
const dest = process.env.DEST;
if (!dest) {
    console.log('Compiling (no deploy destination — local bundle only)');
} else if ((cfg = require("./screeps")[dest]) == null) {
    throw new Error("Invalid upload destination");
}

export default {
    input: "src/main.ts",
    plugins: [
        resolve(),
        commonjs(),
        typescript({tsconfig: "./tsconfig.json"}),
        screeps({config: cfg, dryRun: cfg == null})
    ],
    treeshake: false,
    output: {
        file: "dist/main.js",
        format: "cjs",
        sourcemap: false,
        banner: '// Progressive Ant Supercolony — decentralized Screeps colony\n'
    },
};
