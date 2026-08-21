"use strict";
// Inlined into generated programs. Blocking host ops must resolve on abort
// so IO.race cannot deadlock waiting for a cancelled loser.
module.exports = [
  "  var host_on_abort = function(lib, fn) {",
  "    var ac = lib && lib.abort;",
  "    if (!ac || !ac.signal) return function() {};",
  "    if (ac.signal.aborted) { fn(); return function() {}; }",
  "    ac.signal.addEventListener('abort', fn, {once: true});",
  "    return function() { try { ac.signal.removeEventListener('abort', fn); } catch (eA) {} };",
  "  };",
  "  var host_abortable = function(lib, run) {",
  "    return new Promise(function(res) {",
  "      var done = false;",
  "      var finish = function(v) { if (done) return; done = true; off(); res(v); };",
  "      var off = host_on_abort(lib, function() { finish(host_err('cancelled')); });",
  "      if (lib && lib.abort && lib.abort.signal && lib.abort.signal.aborted) { finish(host_err('cancelled')); return; }",
  "      Promise.resolve().then(function() { return run(finish); }).catch(function(e) { finish(host_err(String(e && e.message || e))); });",
  "    });",
  "  };",
].join("\n") + "\n";
