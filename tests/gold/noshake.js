"use strict";
// Preload for gold (a): `sure Term --fmc` prints Defs.core / term_to_core,
// not shaken FormCore.js show_defs. Maintainers only (refresh.sh).
const path = require("path");
const formcore = path.resolve(__dirname, "../../vendor/formcore-js");
const m = require(formcore);
if (!m.fmc_to_js || typeof m.fmc_to_js.shake_code !== "function") {
  throw new Error("noshake: vendor/formcore-js missing fmc_to_js.shake_code");
}
m.fmc_to_js.shake_code = function (code) {
  return code;
};
