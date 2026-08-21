"use strict";
// HTML/JS emit helpers. No checker.
var path_safe = require("./path_safe");
var scheduler = require("./scheduler");
var px_style = require("./px_style");
var dom_patch = require("./dom_patch");
function sure_emit_safe(term) {
  return path_safe.sureEmitSafe(term);
}

function sure_emit_file(term) {
  if (!sure_emit_safe(term)) return "";
  return "dist/" + term + ".js";
}

function sure_emit_html_file(term) {
  if (!sure_emit_safe(term)) return "";
  return "dist/" + term + ".html";
}

var SURE_DOM_EVENTS = [
  "abort","afterprint","animationcancel","animationend","animationiteration","animationstart",
  "auxclick","beforeinput","beforeprint","beforeunload","blur","cancel","canplay","canplaythrough",
  "change","click","close","compositionend","compositionstart","compositionupdate","contextmenu",
  "copy","cuechange","cut","dblclick","drag","dragend","dragenter","dragleave","dragover",
  "dragstart","drop","durationchange","emptied","ended","error","focus","focusin","focusout",
  "formdata","fullscreenchange","fullscreenerror","gotpointercapture","hashchange","input",
  "invalid","keydown","keypress","keyup","languagechange","load","loadeddata","loadedmetadata",
  "loadstart","lostpointercapture","message","messageerror","mousedown","mouseenter","mouseleave",
  "mousemove","mouseout","mouseover","mouseup","offline","online","pagehide","pageshow","paste",
  "pause","play","playing","pointercancel","pointerdown","pointerenter","pointerleave","pointermove",
  "pointerout","pointerover","pointerup","popstate","progress","ratechange","reset","resize",
  "scroll","scrollend","securitypolicyviolation","seeked","seeking","select","selectionchange",
  "selectstart","slotchange","stalled","storage","submit","suspend","timeupdate","toggle",
  "touchcancel","touchend","touchmove","touchstart","transitioncancel","transitionend",
  "transitionrun","transitionstart","unhandledrejection","unload","volumechange","waiting","wheel",
  "beforematch","beforetoggle","command","open","pagereveal","pageswap","readystatechange",
  "rejectionhandled","visibilitychange"
];

// Runtime listeners. Never bind "error" — a capture listener on document
// intercepts script/resource failures and re-enters the draw path.
var SURE_DOM_CORE_EVENTS = [
  "click","input","change","scroll","mousedown","mousemove","mouseup",
  "keydown","keyup","submit","wheel","pointerdown","pointermove","pointerup",
  "focus","blur","touchstart","touchmove","touchend"
];

function applyPx(n) {
  try {
    var xs = n.querySelectorAll ? n.querySelectorAll("[class]") : [];
    for (var i = 0; i < xs.length; i++) {
      var c = xs[i].className;
      if (typeof c !== "string") continue;
      var re = /((?:min-|max-)?(?:w|h|top|left|right|bottom))-\[(\d+)px\]/g;
      var m;
      while ((m = re.exec(c))) {
        var k = m[1], v = m[2] + "px";
        var st = xs[i].style;
        if (k === "w") st.width = v;
        else if (k === "min-w") st.minWidth = v;
        else if (k === "max-w") st.maxWidth = v;
        else if (k === "h") st.height = v;
        else if (k === "top") st.top = v;
        else if (k === "left") st.left = v;
        else if (k === "right") st.right = v;
        else if (k === "bottom") st.bottom = v;
      }
    }
  } catch (_a) {}
}

function sure_dom_mount(app) {
  if (!app || typeof document === "undefined" || !document) return;
  var root = null;
  try { root = document.getElementById ? document.getElementById("sure-root") : null; } catch (_i) { root = null; }
  if (!root) {
    try {
      if (!document.createElement) return;
      root = document.createElement("div");
      root.id = "sure-root";
      if (!document.body || !document.body.appendChild) return;
      document.body.appendChild(root);
    } catch (_r) { return; }
  }
  if (!root) return;
  if (root.__sureMounted) return;
  root.__sureMounted = 1;
  var ev = ["click","input","change","scroll","mousedown","mousemove","mouseup","keydown","keyup","submit","wheel","pointerdown","pointermove","pointerup","focus","blur","touchstart","touchmove","touchend"];
  var hot = { scroll: 1, mousemove: 1, pointermove: 1, touchmove: 1, wheel: 1 };
  var pass = { scroll: 1, wheel: 1, touchstart: 1, touchmove: 1, touchend: 1 };
  var drawing = false;
  var nested = null;
  function targetOf(e) {
    var t = e && e.target;
    if (!t || typeof t.getAttribute !== "function") return null;
    while (t && t !== document && !(t.getAttribute && t.getAttribute("data-sure-on-" + e.type) != null)) {
      t = t.parentElement;
    }
    return t && t.getAttribute ? t : null;
  }
  function selectOnFocus(e) {
    if (!e || e.type !== "focus") return;
    var ft = e.target;
    if (ft && (ft.tagName === "INPUT" || ft.tagName === "TEXTAREA") && typeof ft.select === "function") {
      try { ft.select(); } catch (_s) {}
    }
  }
  function wireOf(e, msg, t) {
    if (e.type === "submit" || e.type === "mousedown") try { e.preventDefault(); } catch (_p) {}
    var val = t.value == null ? "" : String(t.value);
    if (e.type === "scroll") {
      try { val = String((t.scrollTop | 0) || 0); } catch (_s) { val = "0"; }
    }
    return [e.type, msg, t.id || "", val, e.key || "", e.button || 0, (e.clientX | 0) || 0, (e.clientY | 0) || 0, e.altKey ? 1 : 0, e.ctrlKey ? 1 : 0, e.metaKey ? 1 : 0, e.shiftKey ? 1 : 0, t.checked ? 1 : 0].join("\n");
  }
  function drawHtml(html) {
    html = surePxHtml(String(html == null ? "" : html));
    surePatch(root, html, document, applyPx);
  }
  function bind(onEv) {
    for (var i = 0; i < ev.length; i++) {
      var name = ev[i];
      var opt = pass[name] ? { capture: true, passive: true } : { capture: true };
      try { document.addEventListener(name, onEv, opt); }
      catch (_b) { try { document.addEventListener(name, onEv, true); } catch (_b2) {} }
    }
  }
  var sched;
  function onHot(raw, apply) {
    if (!sched) {
      sched = sureScheduleMake({
        apply: function(p) {
          if (drawing) { nested = p; return; }
          apply(p);
        }
      });
    }
    sched.schedule(raw);
  }
  if (app._ === "Html.Client.new") {
    var model = app.init;
    function draw() { try { drawHtml(app.draw(model)); } catch (_d) {} }
    function apply(raw) {
      drawing = true;
      model = app.step(raw)(model);
      draw();
      drawing = false;
      if (nested != null) { var n = nested; nested = null; apply(n); }
    }
    function onEv(e) {
      try {
        selectOnFocus(e);
        var t = targetOf(e);
        if (!t) return;
        var msg = t.getAttribute("data-sure-on-" + e.type);
        if (msg == null) return;
        var raw = wireOf(e, msg, t);
        if (hot[e.type]) { onHot(raw, apply); return; }
        apply(raw);
      } catch (_e) {}
    }
    bind(onEv);
    draw();
    return;
  }
  if (app._ !== "Sure.Ui.Client.new") return;
  var model = app.init;
  var bags = [];
  var lastSub = null;
  var depth = 0;
  function pairOf(p) {
    if (p && p._ === "Pair.new") return p;
    return { _: "Pair.new", fst: p, snd: "" };
  }
  function draw() { try { drawHtml(app.draw(model)); } catch (_d) {} }
  function applySub(text) {
    text = String(text == null ? "" : text);
    if (text === lastSub) return;
    lastSub = text;
    for (var i = 0; i < bags.length; i++) {
      try { if (bags[i].t) clearInterval(bags[i].t); if (bags[i].es) bags[i].es.close(); } catch (_c) {}
    }
    bags = [];
    if (!text) return;
    var parts = text.split("\n.\n");
    for (var i = 0; i < parts.length; i++) {
      var lines = parts[i].split("\n");
      var k = lines[0] || "";
      if (k === "E") {
        var ms = Number(lines[1]) || 0;
        var msg = lines[2] || "";
        if (ms > 0) {
          var t = setInterval((function (m) { return function () { go("every", m, ""); }; })(msg), ms);
          bags.push({ t: t });
        }
      } else if (k === "S") {
        var path = lines[1] || "";
        var msg = lines[2] || "";
        if (path) {
          try {
            var es = new EventSource(path);
            es.onmessage = (function (m) { return function (ev) { go("sse", m, ev && ev.data ? String(ev.data) : ""); }; })(msg);
            es.onerror = function () {};
            bags.push({ es: es });
          } catch (_s) {}
        }
      }
    }
  }
  function runCmd(text) {
    if (!text) return;
    var parts = String(text).split("\n.\n");
    for (var i = 0; i < parts.length; i++) {
      var lines = parts[i].split("\n");
      var k = lines[0] || "";
      try {
        if (k === "H") {
          var url = lines[1] || "";
          var msg = lines.slice(2).join("\n");
          if (url) {
            fetch(url, { credentials: "same-origin" }).then(function (r) { return r.text(); }).then((function (m) { return function (body) { go("http", m, String(body == null ? "" : body)); }; })(msg)).catch((function (m) { return function () { go("http", m, ""); }; })(msg));
          }
        } else if (k === "O") {
          var url = lines[1] || "";
          var msg = lines[2] || "";
          var body = lines.slice(3).join("\n");
          if (url) {
            fetch(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "text/plain; charset=utf-8" }, body: body }).then(function (r) { return r.text(); }).then((function (m) { return function (b) { go("http", m, String(b == null ? "" : b)); }; })(msg)).catch((function (m) { return function () { go("http", m, ""); }; })(msg));
          }
        } else if (k === "T") {
          var ms = Number(lines[1]) || 0;
          var msg = lines.slice(2).join("\n");
          if (ms > 0) setTimeout((function (m) { return function () { go("tick", m, ""); }; })(msg), ms);
        } else if (k === "P") {
          go("push", lines.slice(1).join("\n"), "");
        }
      } catch (_f) {}
    }
  }
  function go(kind, msg, value) {
    if (depth > 32) return;
    depth++;
    try {
      var raw = [kind, msg, "", value, "", 0, 0, 0, 0, 0, 0, 0, 0].join("\n");
      apply(raw);
    } catch (_g) {}
    depth--;
  }
  function apply(raw) {
    drawing = true;
    var p = pairOf(app.step(raw)(model));
    model = p.fst;
    draw();
    runCmd(p.snd || "");
    applySub(app.listen(model));
    drawing = false;
    if (nested != null) { var n = nested; nested = null; apply(n); }
  }
  function onEv(e) {
    try {
      selectOnFocus(e);
      var t = targetOf(e);
      if (!t) return;
      var msg = t.getAttribute("data-sure-on-" + e.type);
      if (msg == null) return;
      if ((e.type === "change" || e.type === "input") && t.files && t.files[0]) {
        var f = t.files[0];
        if (!f || !f.size) { go("change", msg, ""); return; }
        try {
          var fr = new FileReader();
          fr.onload = function () { go("change", msg, String(fr.result || "")); };
          fr.onerror = function () { go("change", msg, ""); };
          fr.readAsDataURL(f);
        } catch (_r) { go("change", msg, ""); }
        return;
      }
      var raw = wireOf(e, msg, t);
      if (hot[e.type]) { onHot(raw, apply); return; }
      apply(raw);
    } catch (_e) {}
  }
  bind(onEv);
  draw();
  try { runCmd(app.boot || ""); applySub(app.listen(model)); } catch (_b) {}
}

function sure_dom_mount_src() {
  return scheduler.embed() + ";\n" + px_style.embed() + ";\n" + dom_patch.embed() + ";\n"
    + applyPx.toString() + ";var SureDom={mount:" + sure_dom_mount.toString() + "};";
}

function sure_html_css() {
  return "html,body{margin:0}#sure-root{min-height:100vh}"
    + ".overflow-auto{overflow:auto}.overflow-hidden{overflow:hidden}"
    + ".flex{display:flex}.absolute{position:absolute}.relative{position:relative}"
    + ".sticky{position:sticky}.fixed{position:fixed}"
    + ".left-0{left:0}.top-0{top:0}.right-0{right:0}.inset-0{inset:0}.inset-y-0{top:0;bottom:0}"
    + ".h-6{height:1.5rem}.h-\\[480px\\]{height:480px}.w-12{width:3rem}.w-1\\.5{width:.375rem}"
    + ".shrink-0{flex-shrink:0}.box-border{box-sizing:border-box}"
    + ".truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"
    + ".z-10{z-index:10}.z-50{z-index:50}.select-none{user-select:none}.cursor-col-resize{cursor:col-resize}"
    + ".min-h-screen{min-height:100vh}";
}

function sure_html_wrap(term, js) {
  if (!sure_emit_safe(term) || !js) return "";
  var title = String(term).replace(/[^A-Za-z0-9._-]/g, "") || "Sure";
  return "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>" + title
    + "</title><style>" + sure_html_css() + "</style>"
    + "</head><body><div id=\"sure-root\"></div><script>\n"
    + "var module={exports:{}};\n" + js + "\n" + sure_dom_mount_src() + "\n"
    + "SureDom.mount(module.exports[" + JSON.stringify(term) + "]||module.exports);\n"
    + "</script></body></html>\n";
}

module.exports = {
    sure_emit_safe: sure_emit_safe,
    sure_emit_file: sure_emit_file,
    sure_emit_html_file: sure_emit_html_file,
    SURE_DOM_EVENTS: SURE_DOM_EVENTS,
    SURE_DOM_CORE_EVENTS: SURE_DOM_CORE_EVENTS,
    sure_dom_mount: sure_dom_mount,
    sure_dom_mount_src: sure_dom_mount_src,
    sure_html_css: sure_html_css,
    sure_html_wrap: sure_html_wrap,
    applyPx: applyPx
};
