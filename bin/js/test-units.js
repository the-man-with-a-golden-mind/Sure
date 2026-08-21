#!/usr/bin/env node
"use strict";
var fs = require("fs");
var os = require("os");
var path = require("path");
var assert = require("assert");
var protocol = require("./src/protocol");
var manifest_model = require("./src/manifest_model");
var fingerprint = require("./src/fingerprint");
var cache_store = require("./src/cache_store");
var scheduler = require("./src/scheduler");
var px_style = require("./src/px_style");
var path_safe = require("./src/path_safe");
var dom_patch = require("./src/dom_patch");
var emit = require("./src/emit");

var fail = 0;
function check(label, cond, extra) {
  if (cond) console.log("ok   " + label);
  else {
    console.log("FAIL " + label + (extra ? " [" + extra + "]" : ""));
    fail += 1;
  }
}

function dual(name, jsFn, args, eq) {
  var js = jsFn.apply(null, args);
  var res;
  try { res = require("./src/" + name + ".res.js"); } catch (e) { check(name + " res skip", true); return js; }
  var rs = res[Object.keys(res).filter(function(k) { return typeof res[k] === "function"; })[0]];
  check(name + " dual loaded", !!res);
  return js;
}

// protocol
check("req empty", protocol.requestOf("").entry === "" && protocol.requestOf(null).theorems.length === 0);
check("req junk", protocol.requestOf("{")._junk === true);
check("req names", protocol.namesOf({entry: "Main", theorems: ["Main", "Spec.add2"]}).join(",") === "Main,Spec.add2");
check("report empty ok", protocol.reportOf("").ok === true);
check("report junk", protocol.reportOf("nope").ok === false);

// manifest
check("man empty", manifest_model.decodeManifest("").error === "empty");
check("man junk", manifest_model.decodeManifest("[]").error === "junk");
var man = manifest_model.decodeManifest(JSON.stringify({name: "sure/hello", theorems: ["Hello.Spec"]}));
check("man hello", man.ok && man.value.name === "sure/hello" && man.value.theorems[0] === "Hello.Spec");
check("stamp empty", manifest_model.decodeStamp("").ok && manifest_model.decodeStamp("").value === null);
check("stamp junk", manifest_model.decodeStamp("x").error === "junk");

// path
check("emit safe", path_safe.sureEmitSafe("Excel.client") && !path_safe.sureEmitSafe("../x") && !path_safe.sureEmitSafe(""));
check("rel safe", path_safe.sureRelSafe("src/Main.sure") && !path_safe.sureRelSafe("../x") && !path_safe.sureRelSafe("/abs"));

// fingerprint
check("meta line", fingerprint.metaLine("A.sure", 3, 9) === "A.sure\t3\t9");
check("join", fingerprint.joinParts(["a", "b"]) === "a\nb");
check("index junk", fingerprint.decodeIndex("nope").digest === "");
check("index empty", fingerprint.decodeIndex("").version === 1);

// cache
var tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sure-cache-"));
var a1 = cache_store.atomicWrite(tmp, "e1", "hello");
var a2 = cache_store.atomicWrite(tmp, "e1", "hello");
var a3 = cache_store.atomicWrite(tmp, "e1", "world");
check("cache write", a1.ok && a1.written);
check("cache noop", a2.ok && a2.written === false);
check("cache change", a3.written === true);
check("cache outside", cache_store.atomicWrite(tmp, "../x", "no").ok === false);
var st = cache_store.stats(tmp, "abc");
check("cache stats", st.ok && st.files >= 1 && st.dir.indexOf(tmp) >= 0);
cache_store.remember(tmp, "abc", "Nat.add", "e1", "hh", 5);
check("cache skip miss", cache_store.skipIdentical(tmp, "abc", "Nat.add", "no") === false);
check("cache skip hit", cache_store.skipIdentical(tmp, "abc", "Nat.add", "hh") === true);
var cl = cache_store.clean(tmp, {compiler: "abc", keepMs: 0, dropStale: true});
check("cache clean inside", cl.ok && cl.paths.every(function(p) { return p.indexOf(path.resolve(tmp, ".cache")) === 0 || p.indexOf(tmp) >= 0; }));

// scheduler: last wins, one apply per flush, raf fallback
var got = [];
var sched = scheduler.make({
  raf: null,
  apply: function(p) { got.push(p); }
});
sched.schedule("a");
sched.schedule("b");
sched.schedule("c");
check("sched sync fallback", got.length === 3 && got[2] === "c");
var frames = [];
var rafFn = function(cb) { frames.push(cb); return 1; };
var got2 = [];
var s2 = scheduler.make({raf: rafFn, apply: function(p) { got2.push(p); }});
s2.schedule(1);
s2.schedule(2);
s2.schedule(3);
check("sched coalesce queued", got2.length === 0 && s2.pending() === 3);
frames[0]();
check("sched one frame last", got2.length === 1 && got2[0] === 3);

// px
check("px decls", px_style.pxDecls("w-[120px] h-[24px]").join(";") === "width:120px;height:24px");
check("px html", /style="width:24px"/.test(px_style.surePxHtml("<div class=\"h-6 w-[24px]\"></div>")));

// emit mount
var mount = emit.sure_dom_mount_src();
check("mount patch", mount.indexOf("surePatch") >= 0 && mount.indexOf("sureScheduleMake") >= 0);
check("mount no error", mount.indexOf('"error"') < 0 && mount.indexOf("visibilitychange") < 0);
check("mount skip snapshot", mount.indexOf("lastScrollRow") < 0 && mount.indexOf("lastDrawnRow") >= 0 && mount.indexOf("{ r: raw, s: skip }") >= 0);
check("mount sure-y", mount.indexOf("data-sure-y") >= 0);
check("wrap no cdn", emit.sure_html_wrap("Main", "module.exports={};").indexOf("cdn.tailwindcss.com") < 0);
var patchSkip = dom_patch.surePatch({innerHTML: "", __sureHtml: "<p>x</p>"}, "<p>x</p>", {createElement: function(){ return {}; }});
check("patch skip unchanged", patchSkip.skipped === true);
(function() {
  function node(tag) {
    var n = {tag: tag, tagName: tag.toUpperCase(), childNodes: [], attrs: {}, scrollTop: 0, className: "", parentNode: null};
    n.getAttribute = function(k) { return n.attrs[k] != null ? n.attrs[k] : null; };
    n.setAttribute = function(k, v) { n.attrs[k] = String(v); };
    n.appendChild = function(c) { c.parentNode = n; n.childNodes.push(c); return c; };
    n.removeChild = function(c) { n.childNodes = n.childNodes.filter(function(x) { return x !== c; }); c.parentNode = null; return c; };
    n.cloneNode = function(deep) {
      var c = node(n.tag);
      c.attrs = Object.assign({}, n.attrs);
      c.className = n.className;
      if (deep) n.childNodes.forEach(function(ch) { c.appendChild(ch.cloneNode ? ch.cloneNode(true) : ch); });
      return c;
    };
    n.insertBefore = function(c, ref) {
      if (c.parentNode === n) n.removeChild(c);
      c.parentNode = n;
      if (!ref) { n.childNodes.push(c); return c; }
      var i = n.childNodes.indexOf(ref);
      n.childNodes.splice(i < 0 ? n.childNodes.length : i, 0, c);
      return c;
    };
    Object.defineProperty(n, "firstChild", { get: function() { return n.childNodes[0] || null; } });
    Object.defineProperty(n, "nextSibling", { get: function() {
      if (!n.parentNode) return null;
      var xs = n.parentNode.childNodes;
      var i = xs.indexOf(n);
      return i >= 0 ? xs[i + 1] || null : null;
    } });
    return n;
  }
  var live = node("div");
  var port = node("div");
  port.setAttribute("data-sure-scroll", "1");
  port.scrollTop = 48;
  var row = node("div");
  row.setAttribute("data-sure-key", "row-0");
  port.appendChild(row);
  live.appendChild(port);
  var want = node("div");
  var wp = node("div");
  wp.setAttribute("data-sure-scroll", "1");
  var wr = node("div");
  wr.setAttribute("data-sure-key", "row-1");
  wp.appendChild(wr);
  want.appendChild(wp);
  var okm = dom_patch.morphChildren(live, want, {createTextNode: function(t) { return {textContent: t}; }});
  check("morph in place", okm && live.childNodes[0] === port && port.scrollTop === 48);
})();

(function() {
  var vm = require("vm");
  var frames = [];
  function node(tag) {
    var n = { tag: tag, tagName: String(tag).toUpperCase(), attrs: {}, childNodes: [], scrollTop: 0, scrollLeft: 0, id: "", parentElement: null, parentNode: null, isConnected: true, value: "", className: "", _html: "" };
    n.getAttribute = function(k) { return Object.prototype.hasOwnProperty.call(n.attrs, k) ? n.attrs[k] : null; };
    n.setAttribute = function(k, v) { n.attrs[k] = String(v); };
    n.removeAttribute = function(k) { delete n.attrs[k]; };
    n.appendChild = function(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = n; c.parentElement = n; n.childNodes.push(c); return c; };
    n.removeChild = function(c) { n.childNodes = n.childNodes.filter(function(x) { return x !== c; }); c.parentNode = null; c.parentElement = null; return c; };
    n.insertBefore = function(c, ref) {
      if (c.parentNode) c.parentNode.removeChild(c);
      c.parentNode = n; c.parentElement = n;
      if (!ref) { n.childNodes.push(c); return c; }
      var i = n.childNodes.indexOf(ref);
      n.childNodes.splice(i < 0 ? n.childNodes.length : i, 0, c);
      return c;
    };
    n.cloneNode = function(deep) {
      var c = node(n.tag);
      c.attrs = Object.assign({}, n.attrs);
      c._html = n._html;
      c.scrollTop = n.scrollTop;
      if (deep) n.childNodes.forEach(function(ch) { c.appendChild(ch.cloneNode ? ch.cloneNode(true) : ch); });
      return c;
    };
    n.querySelector = function(sel) {
      var hit = null;
      function walk(el) {
        if (hit || !el || !el.getAttribute) return;
        if (sel === "[data-sure-scroll]" && el.getAttribute("data-sure-scroll") != null) hit = el;
        if (sel === "[data-sure-autofocus]" && el.getAttribute("data-sure-autofocus") != null) hit = el;
        (el.childNodes || []).forEach(walk);
      }
      walk(n);
      return hit;
    };
    n.querySelectorAll = function(sel) {
      var out = [];
      function walk(el) {
        if (!el || !el.getAttribute) return;
        if (sel === "[data-sure-scroll]" && el.getAttribute("data-sure-scroll") != null) out.push(el);
        (el.childNodes || []).forEach(walk);
      }
      walk(n);
      return out;
    };
    n.focus = function() {};
    Object.defineProperty(n, "firstChild", { get: function() { return n.childNodes[0] || null; } });
    Object.defineProperty(n, "nextSibling", { get: function() {
      if (!n.parentNode) return null;
      var xs = n.parentNode.childNodes;
      var i = xs.indexOf(n);
      return i >= 0 ? xs[i + 1] || null : null;
    } });
    Object.defineProperty(n, "innerHTML", {
      get: function() { return n._html; },
      set: function(html) {
        n._html = String(html == null ? "" : html);
        n.childNodes = [];
        var s = node("div");
        s.setAttribute("data-sure-scroll", "1");
        s.setAttribute("data-sure-row-h", "24");
        s.setAttribute("data-sure-on-scroll", "scroll");
        var ym = /data-sure-y="([^"]*)"/.exec(n._html);
        if (ym) s.setAttribute("data-sure-y", ym[1]);
        var rm = /data-sure-row="([^"]*)"/.exec(n._html);
        if (rm) s.setAttribute("data-sure-row", rm[1]);
        n.appendChild(s);
      }
    });
    return n;
  }
  var root = node("div");
  root.id = "sure-root";
  var listeners = [];
  var document = {
    getElementById: function(id) { return id === "sure-root" ? root : null; },
    createElement: function(tag) { return node(tag); },
    createTextNode: function(t) { return { textContent: t, nodeValue: t }; },
    addEventListener: function(type, fn) { listeners.push({ type: type, fn: fn }); },
    body: { appendChild: function() {} },
    activeElement: null
  };
  var sandbox = {
    document: document, module: { exports: {} }, console: console,
    requestAnimationFrame: function(cb) { frames.push(cb); return 1; },
    setTimeout: function() {}, setInterval: function() { return 1; }, clearInterval: function() {},
    EventSource: function() {}, Number: Number, String: String, Object: Object, Array: Array
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(emit.sure_dom_mount_src(), sandbox, { timeout: 5000 });
  var drawn = [];
  sandbox.SureDom.mount({
    _: "Sure.Ui.Client.new",
    init: 0,
    draw: function(m) {
      drawn.push(m);
      var row = (m / 24) | 0;
      return '<div data-sure-scroll="1" data-sure-row-h="24" data-sure-y="' + m + '" data-sure-row="' + row + '"></div>';
    },
    step: function(raw) {
      return function() {
        var val = Number(String(raw).split("\n")[3] || "0");
        return { _: "Pair.new", fst: val, snd: "" };
      };
    },
    listen: function() { return ""; },
    boot: ""
  });
  var port = root.querySelector("[data-sure-scroll]");
  function fireScroll(top) {
    port.scrollTop = top;
    var e = { type: "scroll", target: port, preventDefault: function() {}, key: "", button: 0, clientX: 0, clientY: 0, altKey: 0, ctrlKey: 0, metaKey: 0, shiftKey: 0 };
    listeners.filter(function(l) { return l.type === "scroll"; }).forEach(function(l) { l.fn(e); });
  }
  fireScroll(10);
  fireScroll(3000);
  fireScroll(3012);
  check("hot coalesced", frames.length === 1, "frames=" + frames.length);
  if (frames[0]) frames[0]();
  check("jump drew", drawn.length === 2 && drawn[1] === 3012, JSON.stringify(drawn));
})();

// dual-run ReScript if present
function loadRes(name) {
  try { return require("./src/" + name); } catch (e) { return null; }
}
var fpRes = loadRes("FingerprintPure.res.js");
if (fpRes && fpRes.joinParts) {
  check("dual fingerprint", fpRes.joinParts(["a", "b"]) === fingerprint.joinParts(["a", "b"]));
} else check("dual fingerprint skip", true);
var manRes = loadRes("ManifestModel.res.js");
if (manRes && manRes.decodeManifest) {
  var a = JSON.stringify(manifest_model.decodeManifest(""));
  var b = JSON.stringify(manRes.decodeManifest(""));
  check("dual manifest empty", manRes.decodeManifest("").error === "empty" || (manRes.decodeManifest("").TAG === 1));
} else check("dual manifest skip", true);
var pathRes = loadRes("PathSafe.res.js");
if (pathRes && pathRes.sureEmitSafe) {
  check("dual path safe", pathRes.sureEmitSafe("Excel.client") === path_safe.sureEmitSafe("Excel.client") && pathRes.sureEmitSafe("../x") === false && pathRes.sureRelSafe("src/A.sure") === true && pathRes.sureRelSafe("../x") === false);
} else check("dual path safe skip", true);
var protoRes = loadRes("WorkspaceProtocol.res.js");
if (protoRes && protoRes.namesOf) {
  check("dual protocol names", protoRes.namesOf({entry: "Main", theorems: ["T"]}).indexOf("Main") >= 0);
} else check("dual protocol skip", true);

if (fail) process.exit(1);
console.log("unit harness passed");
