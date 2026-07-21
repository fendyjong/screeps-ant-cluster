"use strict";

import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "rollup-plugin-typescript2";

const SERVER_DIRS = [
	"../screeps.com/default",
	"../127_0_0_1___21025/default",
];

const ignoreWarnings = [
	'commonjs-proxy',
	'Circular dependency',
	"The 'this' keyword is equivalent to 'undefined'",
	"Use of eval is strongly discouraged",
];

export default {
	input: "src/main.ts",
	plugins: [
		resolve(),
		commonjs({
			namedExports: {
				'src/Overmind_obfuscated': ['_Overmind'],
				'screeps-profiler': ['profiler'],
				'columnify': ['columnify']
			}
		}),
		typescript({ tsconfig: "./tsconfig.json", include: ["**/*.ts"] }),
	],
	onwarn: function (warning) {
		for (let ignoreWarning of ignoreWarnings) {
			if (warning.toString().includes(ignoreWarning)) {
				return;
			}
		}
		console.warn(warning.message);
	},
	treeshake: false,
	output: SERVER_DIRS.map(dir => ({
		file: dir + "/main.js",
		format: "cjs",
		sourcemap: false,
	})),
};