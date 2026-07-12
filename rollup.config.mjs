import typescript from "@rollup/plugin-typescript";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";

export default {
  input: "src/main.ts",
  plugins: [
    typescript({ tsconfig: "./tsconfig.json", include: ["src/**/*.ts"] }),
    resolve(),
    commonjs(),
  ],
  treeshake: false,
  output: {
    file: "dist/main.js",
    format: "cjs",
    sourcemap: false
  }
};
