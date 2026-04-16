// remote.mjs — ESM wrapper for Smriti Remote Client
// Enables `import { connect } from "smriti-db/remote"` in ESM environments.

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const lib = require("./remote.js");

export const { connect } = lib;
export default lib;
