// remote.mjs — ESM wrapper for Akshara Remote Client
// Enables `import { connect } from "akshara/remote"` in ESM environments.

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const lib = require("./remote.js");

export const { connect } = lib;
export default lib;
