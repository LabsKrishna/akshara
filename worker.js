// worker.js — Parallel scoring thread
"use strict";

const { parentPort }    = require("worker_threads");
const { makeHybridKernel } = require("./kernel");

parentPort.on("message", (msg) => {
  try {
    const { chunk, queryVector, queryTerms = [], config = {} } = msg || {};

    if (!Array.isArray(chunk) || !Array.isArray(queryVector)) {
      throw new Error("Invalid worker payload: chunk and queryVector must be arrays");
    }

    const score   = makeHybridKernel(config);
    const results = new Array(chunk.length);
    for (let i = 0; i < chunk.length; i++) {
      results[i] = score(chunk[i], queryVector, queryTerms);
    }

    parentPort.postMessage({ ok: true, results });
  } catch (err) {
    parentPort.postMessage({ ok: false, error: err?.message || String(err) });
  }
});
