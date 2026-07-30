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
        // Explicit `include`: rollup-plugin-typescript2@0.27.3's default
        // (`*.ts+(|x)`) is an extglob that the installed picomatch@2.3.2
        // (via @rollup/pluginutils@3.1.0) fails to parse — it falls back to
        // matching the literal string "+(|x)", so the default rejects every
        // .ts file in the project. Equivalent coverage without extglob syntax.
        typescript({tsconfig: "./tsconfig.json", include: ["*.ts", "*.tsx", "**/*.ts", "**/*.tsx"]}),
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
