/// <reference types="screeps" />
import _ from "lodash";

// expose lodash globally for existing code that expects a global `_`
(global as any)._ = _;

export {};
