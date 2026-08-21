"use strict";
// Keyed morph of Sure-emitted HTML. Skip when unchanged. Preserve focus,
// selection, checked and scroll. Do not assign root.innerHTML on the update path
// when the live tree can be patched.

function nodeKey(el, i) {
  if (!el || !el.getAttribute) return "#" + i;
  return el.getAttribute("data-sure-key") ||
    el.getAttribute("data-sure-scroll") ||
    el.getAttribute("data-sure-row") ||
    el.getAttribute("data-sure-on-change") ||
    el.getAttribute("data-sure-on-click") ||
    el.getAttribute("data-sure-on-input") ||
    (el.id ? "#" + el.id : "") ||
    ((el.tagName || "") + ":" + i);
}

function isElem(n) {
  return !!(n && n.tagName);
}

function saveFocus(root, document) {
  var out = {el: null, start: null, end: null, scroll: []};
  try {
    var a = document && document.activeElement;
    if (a && root && (a === root || (root.contains && root.contains(a)))) {
      out.el = a;
      if (typeof a.selectionStart === "number") {
        out.start = a.selectionStart;
        out.end = a.selectionEnd;
      }
    }
    var xs = root && root.querySelectorAll ? root.querySelectorAll("[data-sure-scroll]") : [];
    for (var i = 0; i < xs.length; i++) {
      out.scroll.push({
        k: xs[i].getAttribute("data-sure-scroll") || String(i),
        t: xs[i].scrollTop || 0,
        l: xs[i].scrollLeft || 0,
        el: xs[i]
      });
    }
  } catch (_f) {}
  return out;
}

function restoreFocus(saved, root, document) {
  try {
    if (saved && saved.el && saved.el.isConnected !== false) {
      if (saved.el.focus) saved.el.focus();
      if (saved.start != null && typeof saved.el.selectionStart === "number") {
        saved.el.selectionStart = saved.start;
        saved.el.selectionEnd = saved.end;
      }
    }
    if (saved && saved.scroll && root && root.querySelectorAll) {
      var ys = root.querySelectorAll("[data-sure-scroll]");
      for (var j = 0; j < ys.length; j++) {
        var k = ys[j].getAttribute("data-sure-scroll") || String(j);
        for (var s = 0; s < saved.scroll.length; s++) {
          if (saved.scroll[s].k === k) {
            if (saved.scroll[s].el && saved.scroll[s].el === ys[j]) break;
            ys[j].scrollTop = saved.scroll[s].t;
            ys[j].scrollLeft = saved.scroll[s].l;
            break;
          }
        }
      }
    }
  } catch (_r) {}
}

function copyAttrs(from, to) {
  if (!from || !to || !to.setAttribute) return;
  var names = {};
  if (from.attributes) {
    for (var i = 0; i < from.attributes.length; i++) {
      var a = from.attributes[i];
      names[a.name] = 1;
      if (a.name === "value") continue;
      if (to.getAttribute(a.name) !== a.value) to.setAttribute(a.name, a.value);
    }
  }
  if (to.attributes) {
    var drop = [];
    for (var j = 0; j < to.attributes.length; j++) {
      var b = to.attributes[j];
      if (!names[b.name] && b.name !== "value") drop.push(b.name);
    }
    for (var d = 0; d < drop.length; d++) to.removeAttribute(drop[d]);
  }
  if (from.className != null && to.className !== from.className) to.className = from.className;
  var tag = (from.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") {
    if (from.value != null && to.value !== from.value && documentActive(to) === false) to.value = from.value;
    if (!!from.checked !== !!to.checked) to.checked = !!from.checked;
  }
}

function documentActive(el) {
  try {
    var doc = el && el.ownerDocument;
    return !!(doc && doc.activeElement === el);
  } catch (_a) { return false; }
}

function morphChildren(live, want, document) {
  if (!live || !want) return false;
  if (!live.appendChild || !live.removeChild) return false;
  var from = [];
  var kids = live.childNodes || [];
  for (var i = 0; i < kids.length; i++) from.push(kids[i]);
  var to = [];
  var nk = want.childNodes || [];
  for (var j = 0; j < nk.length; j++) to.push(nk[j]);
  var keyed = {};
  for (var f = 0; f < from.length; f++) {
    if (isElem(from[f])) keyed[nodeKey(from[f], f)] = from[f];
  }
  var cursor = live.firstChild;
  function place(node) {
    if (!node) return false;
    if (cursor === node) {
      cursor = node.nextSibling;
      return true;
    }
    if (live.insertBefore) live.insertBefore(node, cursor || null);
    else if (cursor == null) live.appendChild(node);
    else return false;
    cursor = node.nextSibling;
    return true;
  }
  for (var t = 0; t < to.length; t++) {
    var w = to[t];
    if (!isElem(w)) {
      var text = w && (w.textContent != null ? w.textContent : w.nodeValue);
      if (cursor && !isElem(cursor)) {
        if ((cursor.textContent || cursor.nodeValue) !== text) {
          if (cursor.nodeValue != null) cursor.nodeValue = text;
          else if (cursor.textContent != null) cursor.textContent = text;
        }
        cursor = cursor.nextSibling;
        continue;
      }
      if (!document.createTextNode) return false;
      if (!place(document.createTextNode(text || ""))) return false;
      continue;
    }
    var k = nodeKey(w, t);
    var hit = keyed[k];
    if (hit && (hit.tagName || "").toLowerCase() === (w.tagName || "").toLowerCase()) {
      keyed[k] = null;
      copyAttrs(w, hit);
      if (!morphChildren(hit, w, document)) return false;
      if (!place(hit)) return false;
    } else {
      var neu = document.importNode ? document.importNode(w, true) : (w.cloneNode ? w.cloneNode(true) : null);
      if (!neu) return false;
      if (!place(neu)) return false;
    }
  }
  while (cursor) {
    var drop = cursor;
    cursor = cursor.nextSibling;
    live.removeChild(drop);
  }
  return true;
}

function canPatch(root, document) {
  return !!(root && document && document.createElement && root.appendChild && root.removeChild && (root.childNodes || root.firstChild !== undefined));
}

function surePatch(root, html, document, applyPx) {
  html = String(html == null ? "" : html);
  if (!root) return {ok: false, skipped: false, inner: true};
  if (root.__sureHtml === html) return {ok: true, skipped: true, inner: false};
  if (!canPatch(root, document)) {
    try { root.innerHTML = html; } catch (_i) {}
    if (applyPx) try { applyPx(root); } catch (_a) {}
    root.__sureHtml = html;
    return {ok: true, skipped: false, inner: true};
  }
  var saved = saveFocus(root, document);
  var tmp = document.createElement("div");
  tmp.innerHTML = html;
  var patched = false;
  try { patched = morphChildren(root, tmp, document); } catch (_m) { patched = false; }
  if (!patched) {
    try { root.innerHTML = html; } catch (_d) {}
    if (applyPx) try { applyPx(root); } catch (_a2) {}
    restoreFocus(saved, root, document);
    root.__sureHtml = html;
    return {ok: true, skipped: false, inner: true};
  }
  if (applyPx) try { applyPx(root); } catch (_a3) {}
  restoreFocus(saved, root, document);
  root.__sureHtml = html;
  return {ok: true, skipped: false, inner: false};
}

function surePatchEmbed() {
  return [
    nodeKey.toString(),
    isElem.toString(),
    saveFocus.toString(),
    restoreFocus.toString(),
    copyAttrs.toString(),
    documentActive.toString(),
    morphChildren.toString(),
    canPatch.toString(),
    surePatch.toString()
  ].join(";\n");
}

module.exports = {
  nodeKey: nodeKey,
  saveFocus: saveFocus,
  restoreFocus: restoreFocus,
  morphChildren: morphChildren,
  canPatch: canPatch,
  surePatch: surePatch,
  embed: surePatchEmbed
};
