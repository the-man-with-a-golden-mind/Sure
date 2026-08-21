"use strict";
// One frame scheduler for Html.Client and Sure.Ui.Client.
// requestAnimationFrame when present; synchronous fallback otherwise.
// Continuous events coalesce: many calls, one apply, last payload wins.
// Discrete events (click, submit, key) must not go through this helper.

function sureScheduleMake(opts) {
  opts = opts || {};
  var raf = opts.raf;
  var pending = null;
  var queued = false;
  var applies = 0;
  function run() {
    queued = false;
    var p = pending;
    pending = null;
    if (p == null) return;
    applies += 1;
    opts.apply(p);
  }
  function hasRaf() {
    if (typeof raf === "function") return raf;
    if (typeof requestAnimationFrame === "function") return requestAnimationFrame;
    return null;
  }
  function schedule(payload) {
    pending = payload;
    if (queued) return;
    queued = true;
    var fn = hasRaf();
    if (fn) fn(run);
    else run();
  }
  function flush() {
    if (!queued && pending == null) return;
    run();
  }
  function reset() {
    pending = null;
    queued = false;
    applies = 0;
  }
  return {
    schedule: schedule,
    flush: flush,
    reset: reset,
    pending: function() { return pending; },
    applies: function() { return applies; },
    queued: function() { return queued; }
  };
}

function sureScheduleEmbed() {
  return sureScheduleMake.toString();
}

module.exports = {
  make: sureScheduleMake,
  sureScheduleMake: sureScheduleMake,
  embed: sureScheduleEmbed
};
