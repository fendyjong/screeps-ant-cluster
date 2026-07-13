import typescript from "@rollup/plugin-typescript";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";

const SERVER_DIRS = [
  "screeps.com/default",
  "127_0_0_1___21025/default",
];

export default {
  input: "src/main.ts",
  plugins: [
    typescript({ tsconfig: "./tsconfig.json", include: ["src/**/*.ts"] }),
    resolve(),
    commonjs(),
  ],
  treeshake: false,
  output: SERVER_DIRS.map(dir => ({
    file: dir + "/main.js",
    format: "cjs",
    sourcemap: false,
  })),
};
