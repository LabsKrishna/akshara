// server.mjs — ESM wrapper for Akshara HTTP Server
// Allows `import` of the server entry point in ESM environments.

import { createRequire } from "module";
const require = createRequire(import.meta.url);
require("./server.js");
