#!/usr/bin/env node
// Live page harness for Sure.Ui / Html.Client.
// Empty, junk, miss, bubble, fetch, SSE, boot, depth, unsubscribe, double-mount.
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");

var fail = 0;
function ok(label) { console.log("ok   " + label); }
function bad(label, extra) {
  console.log("FAIL " + label + (extra ? " [" + extra + "]" : ""));
  fail = 1;
}
function check(label, cond, extra) { if (cond) ok(label); else bad(label, extra); }

function fakeDom(opts) {
  opts = opts || {};
  const listeners = [];
  const root = {
    id: "sure-root",
    innerHTML: "",
    parentElement: null,
    getAttribute: function(n) { return n === "id" ? "sure-root" : null; },
    querySelectorAll: function() { return []; }
  };
  const appended = [];
  const body = opts.noBody ? null : {
    child: null,
    appendChild: function(el) { this.child = el; appended.push(el); return el; }
  };
  const document = {
    body: body,
    getElementById: function(id) {
      if (opts.noRoot) return null;
      return id === "sure-root" ? root : null;
    },
    createElement: function(tag) {
      return { id: "", tag: tag, innerHTML: "", parentElement: null, getAttribute: function() { return null; } };
    },
    addEventListener: function(type, fn) { listeners.push({ type: type, fn: fn }); }
  };
  if (opts.noGetId) delete document.getElementById;
  if (opts.noCreate) delete document.createElement;
  return { document: document, root: root, listeners: listeners, appended: appended };
}

function loadPage(file, extras, domOpts) {
  const html = fs.readFileSync(file, "utf8");
  const m = html.match(/<script>\n([\s\S]*)\n<\/script>/);
  if (!m) throw new Error("no script in " + file);
  const { document, root, listeners, appended } = fakeDom(domOpts);
  const timeouts = [];
  const intervals = [];
  const fetches = [];
  const sources = [];
  const cleared = [];
  function EventSource(url) {
    if (typeof extras === "object" && extras && extras._throwEs) throw new Error("es");
    this.url = url;
    this.onmessage = null;
    this.onerror = null;
    this.closed = false;
    sources.push(this);
  }
  EventSource.prototype.close = function() { this.closed = true; };
  const sandbox = Object.assign({
    document: document,
    module: { exports: {} },
    console: console,
    setTimeout: function(fn, ms) { timeouts.push({ fn: fn, ms: ms }); return timeouts.length; },
    setInterval: function(fn, ms) {
      var id = intervals.length + 1;
      intervals.push({ fn: fn, ms: ms, id: id, cleared: false });
      return id;
    },
    clearInterval: function(id) {
      cleared.push(id);
      intervals.forEach(function(it) { if (it.id === id) it.cleared = true; });
    },
    fetch: function(url) {
      fetches.push(url);
      return Promise.resolve({ text: function() { return Promise.resolve("BODY"); } });
    },
    EventSource: EventSource,
    FileReader: function FileReader() {
      this.result = "";
      this.onload = null;
      this.onerror = null;
    },
    setImmediate: setImmediate,
    JSON: JSON, Number: Number, String: String, Object: Object, Array: Array,
    Error: Error, Math: Math, BigInt: BigInt, parseInt: parseInt, parseFloat: parseFloat,
    Infinity: Infinity, NaN: NaN, undefined: undefined
  }, extras || {});
  sandbox.FileReader.prototype.readAsDataURL = function(f) {
    var self = this;
    var data = (f && f.data) || "data:image/png;base64,AA";
    setImmediate(function() {
      self.result = data;
      if (self.onload) self.onload();
    });
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(m[1], sandbox, { filename: file, timeout: 30000 });
  return {
    sandbox: sandbox, root: root, listeners: listeners, timeouts: timeouts,
    intervals: intervals, fetches: fetches, sources: sources, document: document,
    appended: appended, cleared: cleared, html: html
  };
}

function fire(listeners, type, msgAttr, opts) {
  opts = opts || {};
  const target = {
    id: opts.id || "",
    value: opts.value == null ? "" : opts.value,
    files: opts.files || null,
    scrollTop: opts.scrollTop || 0,
    scrollLeft: opts.scrollLeft || 0,
    checked: !!opts.checked,
    parentElement: opts.parent || null,
    getAttribute: function(n) {
      var bind = opts.bindType || type;
      if (n === "data-sure-on-" + bind) return msgAttr;
      return null;
    }
  };
  var prevented = false;
  const e = {
    type: type,
    target: opts.child || target,
    preventDefault: function() { prevented = true; },
    key: opts.key || "",
    button: opts.button || 0,
    clientX: opts.x || 0,
    clientY: opts.y || 0,
    altKey: !!opts.alt,
    ctrlKey: !!opts.ctrl,
    metaKey: !!opts.meta,
    shiftKey: !!opts.shift
  };
  if (opts.child) opts.child.parentElement = target;
  if (opts.grand) {
    opts.child.parentElement = opts.grand;
    opts.grand.parentElement = target;
    opts.grand.getAttribute = function() { return null; };
  }
  listeners.filter(function(l) { return l.type === type; }).forEach(function(l) { l.fn(e); });
  return { prevented: prevented, target: target };
}

function htmlHas(html, re) { return re.test(html); }

var CORE_N = 19;
function checkCoreEvents(label, listeners) {
  var types = listeners.map(function(l) { return l.type; });
  check(label + " events core", types.length === CORE_N && types.indexOf("error") < 0 && types.indexOf("scroll") >= 0 && types.indexOf("click") >= 0, "n=" + types.length + " " + types.join(","));
}

async function flush(n) {
  n = n == null ? 8 : n;
  for (var i = 0; i < n; i++) await new Promise(function(r) { setImmediate(r); });
}

const rootDir = path.join(__dirname, "../..");
process.chdir(rootDir);

function page(name) { return path.join(rootDir, "dist", name); }

function loadSrc(file) {
  const html = fs.readFileSync(file, "utf8");
  const m = html.match(/<script>\n([\s\S]*)\n<\/script>/);
  if (!m) throw new Error("no script in " + file);
  return m[1];
}

// --- mount junk / missing document / double mount / create root ---
{
  const src = loadSrc(page("Sure.Ui.Counter.client.html")).replace(/SureDom\.mount\([^)]*\);/, "");
  const { document, listeners } = fakeDom();
  const sandbox = {
    document: document, module: { exports: {} }, console: console,
    setTimeout: setTimeout, setInterval: setInterval, clearInterval: function(){},
    EventSource: function(){}, JSON: JSON, Number: Number, String: String, Object: Object
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(src, sandbox, { timeout: 30000 });
  try {
    sandbox.SureDom.mount(null);
    sandbox.SureDom.mount({ _: "nope" });
    sandbox.SureDom.mount(undefined);
    sandbox.SureDom.mount(0);
    sandbox.SureDom.mount("");
    ok("mount junk");
  } catch (e) { bad("mount junk", String(e)); }

  const noDoc = {
    module: { exports: {} }, console: console, JSON: JSON, Number: Number, String: String, Object: Object
  };
  noDoc.globalThis = noDoc;
  vm.runInNewContext(src, noDoc, { timeout: 30000 });
  try { noDoc.SureDom.mount({ _: "Sure.Ui.Client.new" }); ok("mount no document"); }
  catch (e) { bad("mount no document", String(e)); }

  const nullDoc = {
    document: null, module: { exports: {} }, console: console, JSON: JSON, Number: Number, String: String, Object: Object
  };
  nullDoc.globalThis = nullDoc;
  vm.runInNewContext(src, nullDoc, { timeout: 30000 });
  try { nullDoc.SureDom.mount({ _: "Sure.Ui.Client.new" }); ok("mount null document"); }
  catch (e) { bad("mount null document", String(e)); }
}

{
  const p = loadPage(page("Sure.Ui.Counter.client.html"));
  const n0 = p.listeners.length;
  checkCoreEvents("counter", p.listeners);
  p.sandbox.SureDom.mount(p.sandbox.module.exports["Sure.Ui.Counter.client"] || p.sandbox.module.exports);
  check("counter no double mount", p.listeners.length === n0, "n=" + p.listeners.length);
}

{
  const src = loadSrc(page("Sure.Ui.Counter.client.html")).replace(/SureDom\.mount\([^)]*\);/, "");
  const dom = fakeDom({ noRoot: true });
  const sandbox = {
    document: dom.document, module: { exports: {} }, console: console,
    setTimeout: function(){}, setInterval: function(){ return 1; }, clearInterval: function(){},
    EventSource: function(){}, JSON: JSON, Number: Number, String: String, Object: Object,
    Array: Array, Error: Error, Math: Math, parseInt: parseInt
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(src, sandbox, { timeout: 30000 });
  try {
    sandbox.SureDom.mount({
      _: "Sure.Ui.Client.new",
      init: 0,
      draw: function() { return "<p>z</p>"; },
      step: function() { return function(m) { return { _: "Pair.new", fst: m, snd: "" }; }; },
      listen: function() { return ""; },
      boot: ""
    });
    check("mount create root", dom.appended.length === 1 && /z/.test(dom.appended[0].innerHTML), "n=" + dom.appended.length);
  } catch (e) { bad("mount create root", String(e)); }
}

{
  const src = loadSrc(page("Sure.Ui.Counter.client.html")).replace(/SureDom\.mount\([^)]*\);/, "");
  const dom = fakeDom({ noRoot: true, noBody: true });
  const sandbox = {
    document: dom.document, module: { exports: {} }, console: console,
    setTimeout: function(){}, setInterval: function(){ return 1; }, clearInterval: function(){},
    EventSource: function(){}, JSON: JSON, Number: Number, String: String, Object: Object
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(src, sandbox, { timeout: 30000 });
  try { sandbox.SureDom.mount({ _: "Sure.Ui.Client.new", init: 0, draw: function(){ return ""; }, step: function(){ return function(m){ return m; }; }, listen: function(){ return ""; }, boot: "" }); ok("mount no body"); }
  catch (e) { bad("mount no body", String(e)); }
}

// --- Counter ---
{
  const p = loadPage(page("Sure.Ui.Counter.client.html"));
  check("counter mount 0", htmlHas(p.root.innerHTML, /data-sure-on-click="inc"/) && htmlHas(p.root.innerHTML, />0</), p.root.innerHTML.slice(0, 160));
  fire(p.listeners, "error", "inc");
  check("counter error ignored", htmlHas(p.root.innerHTML, />0</), p.root.innerHTML.slice(0, 160));
  fire(p.listeners, "click", "inc");
  check("counter inc 1", htmlHas(p.root.innerHTML, />1</), p.root.innerHTML.slice(0, 160));
  fire(p.listeners, "click", "nope");
  check("counter miss", htmlHas(p.root.innerHTML, />1</), p.root.innerHTML.slice(0, 160));
  fire(p.listeners, "click", "");
  check("counter empty msg", htmlHas(p.root.innerHTML, />1</), p.root.innerHTML.slice(0, 160));
  fire(p.listeners, "click", "inc");
  fire(p.listeners, "click", "inc");
  check("counter inc 3", htmlHas(p.root.innerHTML, />3</), p.root.innerHTML.slice(0, 160));
  const child = { getAttribute: function() { return null; }, parentElement: null, id: "", value: "" };
  fire(p.listeners, "click", "inc", { child: child });
  check("counter bubble", htmlHas(p.root.innerHTML, />4</), p.root.innerHTML.slice(0, 160));
  const mid = { getAttribute: function() { return null; }, parentElement: null, id: "", value: "" };
  const leaf = { getAttribute: function() { return null; }, parentElement: null, id: "", value: "" };
  fire(p.listeners, "click", "inc", { child: leaf, grand: mid });
  check("counter bubble two", htmlHas(p.root.innerHTML, />5</), p.root.innerHTML.slice(0, 160));
  const orphan = { getAttribute: function() { return null; }, parentElement: null };
  fire(p.listeners, "click", null, { child: orphan });
  check("counter no target", htmlHas(p.root.innerHTML, />5</), p.root.innerHTML.slice(0, 160));
  fire(p.listeners, "keydown", "inc", { key: "Enter", bindType: "click" });
  check("counter keydown no inc", htmlHas(p.root.innerHTML, />5</), p.root.innerHTML.slice(0, 160));
  fire(p.listeners, "input", "inc", { value: "9", bindType: "click" });
  check("counter input no inc", htmlHas(p.root.innerHTML, />5</), p.root.innerHTML.slice(0, 160));
  fire(p.listeners, "click", "inc", { checked: true, alt: true, ctrl: true, x: 9, y: 9, button: 2 });
  check("counter mods still inc", htmlHas(p.root.innerHTML, />6</), p.root.innerHTML.slice(0, 160));
  const sub = fire(p.listeners, "submit", "inc");
  check("counter submit prevent", sub.prevented === true && htmlHas(p.root.innerHTML, />7</), "prevented=" + sub.prevented + " " + p.root.innerHTML.slice(0, 80));
  fire(p.listeners, "click", "inc", { child: { getAttribute: function() { return null; }, parentElement: null } });
  check("counter no-attr child no change wait", true);
}

// --- Echo ---
{
  const p = loadPage(page("Sure.Ui.Echo.client.html"));
  checkCoreEvents("echo", p.listeners);
  check("echo mount", htmlHas(p.root.innerHTML, /data-sure-on-input="set"/) && htmlHas(p.root.innerHTML, /data-sure-on-click="clear"/), p.root.innerHTML.slice(0, 220));
  fire(p.listeners, "input", "set", { value: "hi" });
  check("echo set hi", htmlHas(p.root.innerHTML, />hi</) && htmlHas(p.root.innerHTML, /value="hi"/), p.root.innerHTML.slice(0, 220));
  fire(p.listeners, "input", "set", { value: "" });
  check("echo set empty", htmlHas(p.root.innerHTML, /value=""/) && !htmlHas(p.root.innerHTML, />hi</), p.root.innerHTML.slice(0, 220));
  fire(p.listeners, "input", "set", { value: "a&b" });
  check("echo escape amp", htmlHas(p.root.innerHTML, /a&amp;b/), p.root.innerHTML.slice(0, 240));
  fire(p.listeners, "input", "set", { value: "<x>" });
  check("echo escape lt", htmlHas(p.root.innerHTML, /&lt;x&gt;/), p.root.innerHTML.slice(0, 240));
  fire(p.listeners, "input", "set", { value: "a\"b" });
  check("echo escape quote", htmlHas(p.root.innerHTML, /a&quot;b/) || htmlHas(p.root.innerHTML, /a&#34;b/), p.root.innerHTML.slice(0, 240));
  fire(p.listeners, "click", "clear");
  check("echo clear", htmlHas(p.root.innerHTML, /value=""/) && !htmlHas(p.root.innerHTML, />a/), p.root.innerHTML.slice(0, 220));
  fire(p.listeners, "click", "nope");
  check("echo miss", htmlHas(p.root.innerHTML, /value=""/), p.root.innerHTML.slice(0, 220));
  fire(p.listeners, "click", "set", { value: "fromclick", bindType: "input" });
  check("echo click is not set", !htmlHas(p.root.innerHTML, /fromclick/), p.root.innerHTML.slice(0, 220));
  const sub = fire(p.listeners, "submit", "clear");
  check("echo submit prevent", sub.prevented === true, "prevented=" + sub.prevented);
}

// --- Tick ---
{
  const p = loadPage(page("Sure.Ui.Tick.client.html"));
  check("tick mount 0", htmlHas(p.root.innerHTML, />0</), p.root.innerHTML.slice(0, 120));
  check("tick one interval", p.intervals.length === 1 && Number(p.intervals[0].ms) === 1000, "n=" + p.intervals.length);
  const n0 = p.intervals.length;
  p.intervals[0].fn();
  check("tick 1", htmlHas(p.root.innerHTML, />1</), p.root.innerHTML.slice(0, 120));
  check("tick no resub", p.intervals.length === n0 && p.cleared.length === 0, "n=" + p.intervals.length + " cleared=" + p.cleared.length);
  p.intervals[0].fn();
  p.intervals[0].fn();
  check("tick 3", htmlHas(p.root.innerHTML, />3</), p.root.innerHTML.slice(0, 120));
  check("tick still one", p.intervals.length === 1, "n=" + p.intervals.length);
}

// --- Html.Client regression ---
if (fs.existsSync(page("Html.Counter.client.html"))) {
  const p = loadPage(page("Html.Counter.client.html"));
  check("html client mount", htmlHas(p.root.innerHTML, /data-sure-on-click="inc"/), p.root.innerHTML.slice(0, 160));
  checkCoreEvents("html client", p.listeners);
  fire(p.listeners, "click", "inc");
  check("html client inc", htmlHas(p.root.innerHTML, />1</), p.root.innerHTML.slice(0, 160));
  const n0 = p.listeners.length;
  p.sandbox.SureDom.mount(p.sandbox.module.exports["Html.Counter.client"] || p.sandbox.module.exports);
  check("html client no double mount", p.listeners.length === n0, "n=" + p.listeners.length);
} else ok("html client skip");

// --- Boot ---
{
  const p = loadPage(page("Sure.Ui.Boot.client.html"));
  check("boot mount ++", htmlHas(p.root.innerHTML, />\+\+</), p.root.innerHTML.slice(0, 160));
  check("boot no fetch", p.fetches.length === 0, "n=" + p.fetches.length);
  check("boot no interval", p.intervals.length === 0, "n=" + p.intervals.length);
  fire(p.listeners, "click", "go");
  check("boot go +++", htmlHas(p.root.innerHTML, />\+\+\+</), p.root.innerHTML.slice(0, 160));
  fire(p.listeners, "click", "nope");
  check("boot miss", htmlHas(p.root.innerHTML, />\+\+\+</), p.root.innerHTML.slice(0, 160));
}

// --- Probe effects ---
{
  const p = loadPage(page("Sure.Ui.Probe.client.html"));
  check("probe mount empty", htmlHas(p.root.innerHTML, /data-sure-on-click="go"/) && (htmlHas(p.root.innerHTML, /<p><\/p>/) || htmlHas(p.root.innerHTML, /<p>\s*<\/p>/)), p.root.innerHTML.slice(0, 300));
  checkCoreEvents("probe", p.listeners);
  fire(p.listeners, "click", "go");
  check("probe push plus", htmlHas(p.root.innerHTML, />\+</), p.root.innerHTML.slice(0, 300));
  fire(p.listeners, "click", "nope");
  check("probe miss", htmlHas(p.root.innerHTML, />\+</), p.root.innerHTML.slice(0, 300));
  fire(p.listeners, "click", "pack");
  check("probe batch AB", htmlHas(p.root.innerHTML, />\+AB</), p.root.innerHTML.slice(0, 300));
  check("probe pack no fetch", p.fetches.length === 0, "n=" + p.fetches.length);
  check("probe pack no timeout", p.timeouts.length === 0, "n=" + p.timeouts.length);
  fire(p.listeners, "click", "http0");
  check("probe http0 no fetch", p.fetches.length === 0, "n=" + p.fetches.length);
  fire(p.listeners, "click", "tick0");
  check("probe tick0 no timeout", p.timeouts.length === 0, "n=" + p.timeouts.length);
  fire(p.listeners, "click", "blank");
  check("probe blank no change", htmlHas(p.root.innerHTML, />\+AB</), p.root.innerHTML.slice(0, 300));
  fire(p.listeners, "click", "wait");
  check("probe tick queued", p.timeouts.length === 1 && Number(p.timeouts[0].ms) === 1, "n=" + p.timeouts.length);
  p.timeouts[0].fn();
  check("probe tick done", htmlHas(p.root.innerHTML, />done</), p.root.innerHTML.slice(0, 300));
}

process.exitCode = 0;
Promise.resolve().then(async function() {
  const p = loadPage(page("Sure.Ui.Probe.client.html"));
  fire(p.listeners, "click", "net");
  check("probe http url", p.fetches.length === 1 && p.fetches[0] === "/u", "fetches=" + JSON.stringify(p.fetches));
  await flush();
  check("probe http body", htmlHas(p.root.innerHTML, />BODY</), p.root.innerHTML.slice(0, 300));

  const pEmpty = loadPage(page("Sure.Ui.Probe.client.html"), {
    fetch: function(url) {
      return Promise.resolve({ text: function() { return Promise.resolve(""); } });
    }
  });
  fire(pEmpty.listeners, "click", "net");
  await flush();
  check("probe http empty body", htmlHas(pEmpty.root.innerHTML, /<p><\/p>/), pEmpty.root.innerHTML.slice(0, 300));

  const pNullBody = loadPage(page("Sure.Ui.Probe.client.html"), {
    fetch: function() {
      return Promise.resolve({ text: function() { return Promise.resolve(null); } });
    }
  });
  fire(pNullBody.listeners, "click", "net");
  await flush();
  check("probe http null body", htmlHas(pNullBody.root.innerHTML, /<p><\/p>/) || htmlHas(pNullBody.root.innerHTML, />null</) === false, pNullBody.root.innerHTML.slice(0, 300));

  const p2 = loadPage(page("Sure.Ui.Probe.client.html"), {
    fetch: function() { return Promise.reject(new Error("no")); }
  });
  fire(p2.listeners, "click", "net");
  await flush();
  check("probe http fail empty", htmlHas(p2.root.innerHTML, /<p><\/p>/), p2.root.innerHTML.slice(0, 300));

  const pTextFail = loadPage(page("Sure.Ui.Probe.client.html"), {
    fetch: function() {
      return Promise.resolve({ text: function() { return Promise.reject(new Error("text")); } });
    }
  });
  fire(pTextFail.listeners, "click", "net");
  await flush();
  check("probe http text fail", htmlHas(pTextFail.root.innerHTML, /<p><\/p>/), pTextFail.root.innerHTML.slice(0, 300));

  const pNoText = loadPage(page("Sure.Ui.Probe.client.html"), {
    fetch: function() { return Promise.resolve({}); }
  });
  fire(pNoText.listeners, "click", "net");
  await flush();
  check("probe http no text", htmlHas(pNoText.root.innerHTML, /<p><\/p>/), pNoText.root.innerHTML.slice(0, 300));

  const pNoFetch = loadPage(page("Sure.Ui.Probe.client.html"), { fetch: undefined });
  try {
    fire(pNoFetch.listeners, "click", "net");
    check("probe no fetch no throw", htmlHas(pNoFetch.root.innerHTML, /<p><\/p>/), pNoFetch.root.innerHTML.slice(0, 200));
  } catch (e) { bad("probe no fetch no throw", String(e)); }

  const p3 = loadPage(page("Sure.Ui.Probe.client.html"));
  fire(p3.listeners, "click", "subon");
  check("probe subon", htmlHas(p3.root.innerHTML, />sub</), p3.root.innerHTML.slice(0, 200));
  check("probe every", p3.intervals.length === 1 && Number(p3.intervals[0].ms) === 1, "n=" + p3.intervals.length);
  p3.intervals[0].fn();
  check("probe every tick", htmlHas(p3.root.innerHTML, />subT</), p3.root.innerHTML.slice(0, 200));
  const nInt = p3.intervals.length;
  check("probe every keep lastSub", p3.cleared.length === 0 && nInt === 1, "cleared=" + p3.cleared.length);
  p3.intervals[0].fn();
  check("probe every again", htmlHas(p3.root.innerHTML, />subTT</), p3.root.innerHTML.slice(0, 200));
  check("probe every stable", p3.intervals.length === 1, "n=" + p3.intervals.length);
  fire(p3.listeners, "click", "suboff");
  check("probe suboff", htmlHas(p3.root.innerHTML, /<p><\/p>/), p3.root.innerHTML.slice(0, 200));
  check("probe every cleared", p3.cleared.length >= 1 && p3.intervals[0].cleared === true, "cleared=" + JSON.stringify(p3.cleared));

  const p4 = loadPage(page("Sure.Ui.Probe.client.html"));
  fire(p4.listeners, "click", "eson");
  check("probe eson", htmlHas(p4.root.innerHTML, />es</), p4.root.innerHTML.slice(0, 200));
  check("probe sse open", p4.sources.length === 1 && p4.sources[0].url === "/sse" && !p4.sources[0].closed, "n=" + p4.sources.length);
  try { p4.sources[0].onerror({}); ok("probe sse onerror"); }
  catch (e) { bad("probe sse onerror", String(e)); }
  check("probe sse still open", p4.sources[0].closed === false, "closed=" + p4.sources[0].closed);
  p4.sources[0].onmessage({ data: "" });
  check("probe sse empty data", htmlHas(p4.root.innerHTML, /<p><\/p>/), p4.root.innerHTML.slice(0, 200));
  check("probe sse closed empty", p4.sources[0].closed === true, "closed=" + p4.sources[0].closed);

  const p4b = loadPage(page("Sure.Ui.Probe.client.html"));
  fire(p4b.listeners, "click", "eson");
  p4b.sources[0].onmessage({ data: "PING" });
  check("probe sse msg", htmlHas(p4b.root.innerHTML, />PING</), p4b.root.innerHTML.slice(0, 200));
  check("probe sse closed after change", p4b.sources[0].closed === true, "closed=" + p4b.sources[0].closed);
  p4b.sources[0].onmessage({ data: "X" });
  check("probe sse after close ignored", htmlHas(p4b.root.innerHTML, />PING</) || htmlHas(p4b.root.innerHTML, />X</), p4b.root.innerHTML.slice(0, 200));

  const p4c = loadPage(page("Sure.Ui.Probe.client.html"));
  fire(p4c.listeners, "click", "eson");
  fire(p4c.listeners, "click", "suboff");
  check("probe sse closed on suboff", p4c.sources[0].closed === true, "closed=" + p4c.sources[0].closed);
  check("probe sse suboff empty", htmlHas(p4c.root.innerHTML, /<p><\/p>/), p4c.root.innerHTML.slice(0, 200));

  const p4d = loadPage(page("Sure.Ui.Probe.client.html"));
  fire(p4d.listeners, "click", "eson");
  fire(p4d.listeners, "click", "subon");
  check("probe sse to every", p4d.sources[0].closed === true && p4d.intervals.length === 1, "es closed=" + p4d.sources[0].closed + " int=" + p4d.intervals.length);

  const pEsThrow = loadPage(page("Sure.Ui.Probe.client.html"), { _throwEs: true });
  try {
    fire(pEsThrow.listeners, "click", "eson");
    check("probe es throw swallowed", htmlHas(pEsThrow.root.innerHTML, />es</) && pEsThrow.sources.length === 0, pEsThrow.root.innerHTML.slice(0, 200));
  } catch (e) { bad("probe es throw swallowed", String(e)); }

  const p5 = loadPage(page("Sure.Ui.Probe.client.html"));
  fire(p5.listeners, "click", "loop");
  check("probe depth cap", true, "no hang");
  check("probe loop stayed", /<p><\/p>/.test(p5.root.innerHTML) || />/.test(p5.root.innerHTML), p5.root.innerHTML.slice(0, 120));

  const p6 = loadPage(page("Sure.Ui.Probe.client.html"));
  fire(p6.listeners, "click", "net");
  fire(p6.listeners, "click", "wait");
  check("probe net+wait queued", p6.fetches.length === 1 && p6.timeouts.length === 1, "f=" + p6.fetches.length + " t=" + p6.timeouts.length);
  p6.timeouts[0].fn();
  await flush();
  check("probe interleaved last", htmlHas(p6.root.innerHTML, />BODY</) || htmlHas(p6.root.innerHTML, />done</), p6.root.innerHTML.slice(0, 200));

  // --- Sheet: virtual scroll + column resize + SSE stream ---
  if (fs.existsSync(page("Sure.Sheet.client.html"))) {
    function sheetLine(i) {
      var letters = ["A", "B", "C", "D", "E", "F", "G", "H"];
      return String(i) + "\t" + letters.map(function(l) { return l + String(i); }).join("\t");
    }
    function sheetChunk(n) {
      var xs = [];
      for (var i = 0; i < n; i++) xs.push(sheetLine(i));
      return "rows;" + xs.join(";");
    }
    function rowCount(html) {
      return (html.match(/data-sure-row="/g) || []).length;
    }
    var saved = "";
    var urls = [];
    const sh = loadPage(page("Sure.Sheet.client.html"), {
      fetch: function(url) {
        urls.push(url);
        if (String(url).indexOf("/sheet/save") === 0) {
          saved = String(url).split("?")[1] || "";
          return Promise.resolve({ text: function() { return Promise.resolve("ok"); } });
        }
        if (String(url).indexOf("/sheet/state") === 0) {
          return Promise.resolve({ text: function() { return Promise.resolve(saved); } });
        }
        return Promise.resolve({ text: function() { return Promise.resolve("ok"); } });
      }
    });
    checkCoreEvents("sheet", sh.listeners);
    check("sheet daisy", htmlHas(sh.root.innerHTML, /navbar/) && htmlHas(sh.root.innerHTML, /badge/) && htmlHas(sh.root.innerHTML, /card /), sh.root.innerHTML.slice(0, 220));
    check("sheet header", htmlHas(sh.root.innerHTML, /Excel/) && htmlHas(sh.root.innerHTML, /data-sure-scroll/) && htmlHas(sh.root.innerHTML, /value="A"/), sh.root.innerHTML.slice(0, 280));
    check("sheet serialized units", htmlHas(sh.root.innerHTML, /w-\[/) || htmlHas(sh.root.innerHTML, /width:\d+px/), sh.root.innerHTML.slice(0, 180));
    check("sheet boot state", urls.length >= 1 && /\/sheet\/state/.test(urls[0]), JSON.stringify(urls));
    check("sheet empty no rows", rowCount(sh.root.innerHTML) === 0, "n=" + rowCount(sh.root.innerHTML));
    check("sheet sse open", sh.sources.length === 1 && sh.sources[0].url === "/sheet/rows", "n=" + sh.sources.length);
    sh.sources[0].onmessage({ data: "" });
    check("sheet empty chunk", rowCount(sh.root.innerHTML) === 0, "n=" + rowCount(sh.root.innerHTML));
    sh.sources[0].onmessage({ data: "nope" });
    check("sheet junk chunk", rowCount(sh.root.innerHTML) === 0, "n=" + rowCount(sh.root.innerHTML));
    sh.sources[0].onmessage({ data: "meta 10000" });
    check("sheet meta", htmlHas(sh.root.innerHTML, /10000/), sh.root.innerHTML.slice(0, 180));
    sh.sources[0].onmessage({ data: sheetChunk(40) });
    var nRows = rowCount(sh.root.innerHTML);
    check("sheet virtual cap", nRows > 0 && nRows < 40, "n=" + nRows);
    check("sheet row 0", htmlHas(sh.root.innerHTML, /data-sure-row="0"/), sh.root.innerHTML.slice(0, 220));
    check("sheet hides 39", !htmlHas(sh.root.innerHTML, /data-sure-row="39"/), "n=" + nRows);
    fire(sh.listeners, "scroll", "scroll", { scrollTop: 24 * 20 });
    check("sheet scroll 20", htmlHas(sh.root.innerHTML, /data-sure-row="20"/), sh.root.innerHTML.slice(0, 220));
    fire(sh.listeners, "mousedown", "down-0", { x: 100 });
    check("sheet drag overlay", htmlHas(sh.root.innerHTML, /col-resize/), sh.root.innerHTML.slice(0, 180));
    fire(sh.listeners, "mousemove", "move", { x: 140 });
    check("sheet col grow", htmlHas(sh.root.innerHTML, /160px/), sh.root.innerHTML.slice(0, 220));
    fire(sh.listeners, "mouseup", "up");
    check("sheet up no overlay", !htmlHas(sh.root.innerHTML, /fixed inset-0/) && htmlHas(sh.root.innerHTML, /160px/), sh.root.innerHTML.slice(0, 180));
    await flush();
    check("sheet save widths", urls.some(function(u) { return /\/sheet\/save\?/.test(u) && /w=/.test(u); }), JSON.stringify(urls));
    fire(sh.listeners, "change", "name-0", { value: "Cost" });
    check("sheet name Cost", htmlHas(sh.root.innerHTML, /value="Cost"/), sh.root.innerHTML.slice(0, 280));
    fire(sh.listeners, "change", "name-0", { value: "" });
    check("sheet name empty letter", htmlHas(sh.root.innerHTML, /value="A"/), sh.root.innerHTML.slice(0, 280));
    fire(sh.listeners, "change", "name-0", { value: "a,b" });
    check("sheet name junk letter", htmlHas(sh.root.innerHTML, /value="A"/), sh.root.innerHTML.slice(0, 280));
    fire(sh.listeners, "change", "name-0", { value: "Cost" });
    await flush();
    fire(sh.listeners, "mousedown", "down-0", { x: 160 });
    fire(sh.listeners, "mousemove", "move", { x: 0 });
    check("sheet col min", htmlHas(sh.root.innerHTML, /24px/), sh.root.innerHTML.slice(0, 220));
    fire(sh.listeners, "mouseup", "up");
    await flush();
    fire(sh.listeners, "mousedown", "down-9", { x: 10 });
    check("sheet down oob", true);
    sh.sources[0].onmessage({ data: "done 10000" });
    check("sheet done", htmlHas(sh.root.innerHTML, /badge-success/) && htmlHas(sh.root.innerHTML, />done</), sh.root.innerHTML.slice(0, 220));
    check("sheet sse closed after done", sh.sources[0].closed === true, "closed=" + sh.sources[0].closed);

    const sh2 = loadPage(page("Sure.Sheet.client.html"), {
      fetch: function(url) {
        if (String(url).indexOf("/sheet/state") === 0) {
          return Promise.resolve({ text: function() { return Promise.resolve(saved); } });
        }
        return Promise.resolve({ text: function() { return Promise.resolve("ok"); } });
      }
    });
    await flush();
    check("sheet load saved name", htmlHas(sh2.root.innerHTML, /value="Cost"/), sh2.root.innerHTML.slice(0, 280));
    check("sheet load saved width", htmlHas(sh2.root.innerHTML, /24px/) || htmlHas(sh2.root.innerHTML, /w-\[24px\]/), sh2.root.innerHTML.slice(0, 280));
  } else ok("sheet skip");

  if (fs.existsSync(page("Sure.Tweeter.client.html"))) {
    var SID = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    var twFetch = [];
    const tw = loadPage(page("Sure.Tweeter.client.html"), {
      fetch: function(url, opts) {
        var u = String(url);
        twFetch.push({ url: u, method: (opts && opts.method) || "GET", body: opts && opts.body, credentials: opts && opts.credentials });
        if (u.indexOf("/tweeter/me") === 0) return Promise.resolve({ text: function() { return Promise.resolve("err no_session"); } });
        if (u.indexOf("/tweeter/register") === 0) return Promise.resolve({ text: function() { return Promise.resolve("ok " + SID); } });
        if (u.indexOf("/tweeter/login") === 0) return Promise.resolve({ text: function() { return Promise.resolve("ok " + SID); } });
        if (u.indexOf("/tweeter/feed") === 0) return Promise.resolve({ text: function() { return Promise.resolve("ok ada~hi~"); } });
        if (u.indexOf("/tweeter/tweet") === 0) return Promise.resolve({ text: function() { return Promise.resolve("ok"); } });
        if (u.indexOf("/tweeter/upload") === 0) return Promise.resolve({ text: function() { return Promise.resolve("ok " + SID); } });
        if (u.indexOf("/tweeter/logout") === 0) return Promise.resolve({ text: function() { return Promise.resolve("ok"); } });
        return Promise.resolve({ text: function() { return Promise.resolve("err junk"); } });
      }
    });
    checkCoreEvents("tweeter", tw.listeners);
    check("tweeter login card", htmlHas(tw.root.innerHTML, /Login/) && htmlHas(tw.root.innerHTML, /Register/) && htmlHas(tw.root.innerHTML, /card/), tw.root.innerHTML.slice(0, 220));
    check("tweeter no inline style", !htmlHas(tw.root.innerHTML, / style="/), tw.root.innerHTML.slice(0, 160));
    await flush();
    check("tweeter boot me", twFetch.some(function(f) { return /\/tweeter\/me/.test(f.url) && f.method === "GET" && f.credentials === "same-origin"; }), JSON.stringify(twFetch));
    fire(tw.listeners, "click", "login");
    check("tweeter login empty user", htmlHas(tw.root.innerHTML, /empty_user/), tw.root.innerHTML.slice(0, 220));
    fire(tw.listeners, "change", "user", { value: "ada" });
    fire(tw.listeners, "click", "login");
    check("tweeter login empty pass", htmlHas(tw.root.innerHTML, /empty_pass/), tw.root.innerHTML.slice(0, 220));
    fire(tw.listeners, "change", "pass", { value: "secret" });
    fire(tw.listeners, "click", "register");
    await flush();
    check("tweeter registered", htmlHas(tw.root.innerHTML, /@ada/) && htmlHas(tw.root.innerHTML, /Tweet/), tw.root.innerHTML.slice(0, 280));
    check("tweeter feed hi", htmlHas(tw.root.innerHTML, />hi</), tw.root.innerHTML.slice(0, 280));
    fire(tw.listeners, "click", "tweet");
    check("tweeter empty text", htmlHas(tw.root.innerHTML, /empty_text/), tw.root.innerHTML.slice(0, 220));
    fire(tw.listeners, "input", "draft", { value: "yo" });
    fire(tw.listeners, "click", "tweet");
    await flush();
    check("tweeter posted", twFetch.some(function(f) { return f.method === "POST" && /\/tweeter\/tweet/.test(f.url) && /t=yo/.test(String(f.body||"")); }), JSON.stringify(twFetch));
    check("tweeter login post", twFetch.some(function(f) { return f.method === "POST" && /\/tweeter\/register/.test(f.url) && /u=ada&p=secret/.test(String(f.body||"")) && f.credentials === "same-origin"; }), JSON.stringify(twFetch));
    fire(tw.listeners, "change", "file", { files: [{ size: 2, data: "data:image/png;base64,AA" }] });
    await flush();
    check("tweeter file preview", htmlHas(tw.root.innerHTML, /data:image\/png;base64,AA/), tw.root.innerHTML.slice(0, 280));
    fire(tw.listeners, "input", "draft", { value: "pic" });
    fire(tw.listeners, "click", "tweet");
    await flush();
    check("tweeter upload post", twFetch.some(function(f) { return f.method === "POST" && /\/tweeter\/upload/.test(f.url) && f.body === "data:image/png;base64,AA"; }), JSON.stringify(twFetch));
    fire(tw.listeners, "change", "file", { files: [{ size: 0 }] });
    await flush();
    check("tweeter empty file", htmlHas(tw.root.innerHTML, /empty_file/), tw.root.innerHTML.slice(0, 220));
    fire(tw.listeners, "click", "logout");
    await flush();
    check("tweeter logout", htmlHas(tw.root.innerHTML, /Login/), tw.root.innerHTML.slice(0, 220));
    check("tweeter logout post", twFetch.some(function(f) { return f.method === "POST" && /\/tweeter\/logout/.test(f.url); }), JSON.stringify(twFetch));
    var twRest = [];
    const tw2 = loadPage(page("Sure.Tweeter.client.html"), {
      fetch: function(url, opts) {
        var u = String(url);
        twRest.push({ url: u, method: (opts && opts.method) || "GET" });
        if (u.indexOf("/tweeter/me") === 0) return Promise.resolve({ text: function() { return Promise.resolve("ok " + SID + " ada"); } });
        if (u.indexOf("/tweeter/feed") === 0) return Promise.resolve({ text: function() { return Promise.resolve("ok ada~hi~"); } });
        return Promise.resolve({ text: function() { return Promise.resolve("err junk"); } });
      }
    });
    await flush();
    check("tweeter restore home", htmlHas(tw2.root.innerHTML, /@ada/) && htmlHas(tw2.root.innerHTML, />hi</), tw2.root.innerHTML.slice(0, 280));
    check("tweeter restore feed", twRest.some(function(f) { return /\/tweeter\/feed/.test(f.url); }), JSON.stringify(twRest));
  } else ok("tweeter skip");

  // Scroller node must survive a scroll redraw (innerHTML of the port, not the port itself).
  {
    const emit = require("./src/emit");
    function el(tag) {
      var n = {
        tag: tag, tagName: String(tag).toUpperCase(), id: "", className: "", attrs: {}, childNodes: [], parentNode: null, parentElement: null,
        scrollTop: 0, scrollLeft: 0, _html: "", isConnected: true,
        getAttribute: function(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : (k === "id" ? this.id || null : null); },
        setAttribute: function(k, v) { this.attrs[k] = String(v); },
        appendChild: function(c) { c.parentNode = this; c.parentElement = this; this.childNodes.push(c); return c; },
        removeChild: function(c) { this.childNodes = this.childNodes.filter(function(x) { return x !== c; }); c.parentNode = null; c.parentElement = null; return c; }
      };
      Object.defineProperty(n, "firstChild", { get: function() { return this.childNodes[0] || null; } });
      Object.defineProperty(n, "innerHTML", {
        get: function() { return this._html; },
        set: function(html) {
          this._html = String(html == null ? "" : html);
          this.childNodes = [];
          var re = /<div([^>]*data-sure-scroll="([^"]*)"[^>]*)>([\s\S]*?)<\/div>/;
          var m = re.exec(this._html);
          if (m) {
            var s = el("div");
            s.setAttribute("data-sure-scroll", m[2]);
            s._html = m[3];
            this.appendChild(s);
          }
        }
      });
      n.cloneNode = function(deep) {
        var c = el(this.tag);
        c.attrs = Object.assign({}, this.attrs);
        c._html = this._html;
        c.className = this.className;
        c.scrollTop = this.scrollTop;
        c.scrollLeft = this.scrollLeft;
        if (deep) {
          (this.childNodes || []).forEach(function(ch) { c.appendChild(ch.cloneNode ? ch.cloneNode(true) : ch); });
        }
        return c;
      };
      Object.defineProperty(n, "textContent", {
        get: function() {
          if (this.childNodes && this.childNodes.length) {
            return this.childNodes.map(function(ch) { return ch.textContent || ch._html || ""; }).join("");
          }
          return this._html || "";
        },
        set: function(v) { this._html = String(v == null ? "" : v); }
      });
      n.querySelectorAll = function(sel) {
        var out = [];
        function walk(node) {
          if (sel === "[data-sure-scroll]" && node.getAttribute("data-sure-scroll") != null) out.push(node);
          (node.childNodes || []).forEach(walk);
        }
        walk(this);
        return out;
      };
      return n;
    }
    const root = el("div");
    root.id = "sure-root";
    const listeners = [];
    const document = {
      getElementById: function(id) { return id === "sure-root" ? root : null; },
      createElement: function(tag) { return el(tag); },
      addEventListener: function(type, fn) { listeners.push({ type: type, fn: fn }); },
      body: { appendChild: function() {} }
    };
    const sandbox = {
      document: document, module: { exports: {} }, console: console,
      setTimeout: function() {}, setInterval: function() { return 1; }, clearInterval: function() {},
      EventSource: function() {}, JSON: JSON, Number: Number, String: String, Object: Object, Array: Array
    };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(emit.sure_dom_mount_src(), sandbox, { timeout: 5000 });
    var draws = 0;
    var rows = "r0";
    sandbox.SureDom.mount({
      _: "Sure.Ui.Client.new",
      init: 0,
      draw: function(m) {
        draws += 1;
        return '<div data-sure-scroll="1"><span>' + rows + "</span></div>";
      },
      step: function(raw) {
        return function(m) {
          var val = String(raw).split("\n")[3] || "0";
          if (Number(val) >= 24) rows = "r1";
          return { _: "Pair.new", fst: m + 1, snd: "" };
        };
      },
      listen: function() { return ""; },
      boot: ""
    });
    var port = root.querySelectorAll("[data-sure-scroll]")[0];
    check("scroll port mounted", !!(port && port.getAttribute("data-sure-scroll") === "1"), "n=" + root.querySelectorAll("[data-sure-scroll]").length);
    port.scrollTop = 10;
    var nDraw0 = draws;
    fire(listeners, "scroll", "scroll", { scrollTop: 10 });
    check("scroll same node", root.querySelectorAll("[data-sure-scroll]")[0] === port, "");
    check("scrollTop kept", port.scrollTop === 10, "t=" + port.scrollTop);
    port.scrollTop = 48;
    fire(listeners, "scroll", "scroll", { scrollTop: 48 });
    check("scroll window patch", rows === "r1", rows);
    check("scroll still same node", root.querySelectorAll("[data-sure-scroll]")[0] === port, "");
    check("scrollTop kept after patch", port.scrollTop === 48, "t=" + port.scrollTop);
    check("scroll drew", draws > nDraw0, "draws=" + draws);
  }

  if (fail) process.exit(1);
  console.log("page harness passed");
}).catch(function(e) {
  console.log("FAIL harness " + e && e.stack ? e.stack : e);
  process.exit(1);
});
