"use strict";
// Move Tailwind-like w-[Npx] classes onto inline style so applyPx is not
// required on the live tree. applyPx remains a compatibility fallback.

var PX_RE = /((?:min-|max-)?(?:w|h|top|left|right|bottom))-\[(\d+)px\]/g;
var STYLE_MAP = {
  "w": "width",
  "min-w": "min-width",
  "max-w": "max-width",
  "h": "height",
  "top": "top",
  "left": "left",
  "right": "right",
  "bottom": "bottom"
};

function pxDecls(className) {
  var c = String(className || "");
  var out = [];
  var m;
  PX_RE.lastIndex = 0;
  while ((m = PX_RE.exec(c))) {
    var prop = STYLE_MAP[m[1]];
    if (prop) out.push(prop + ":" + m[2] + "px");
  }
  return out;
}

function mergeStyle(existing, decls) {
  var cur = String(existing || "").replace(/;+\s*$/, "");
  var have = {};
  cur.split(";").forEach(function(part) {
    var k = part.split(":")[0].trim();
    if (k) have[k] = true;
  });
  var add = [];
  for (var i = 0; i < decls.length; i++) {
    var k = decls[i].split(":")[0];
    if (!have[k]) add.push(decls[i]);
  }
  if (!add.length) return existing == null ? "" : String(existing);
  return (cur ? cur + ";" : "") + add.join(";");
}

function surePxHtml(html) {
  html = String(html == null ? "" : html);
  if (html.indexOf("px]") < 0) return html;
  return html.replace(/<([a-zA-Z0-9]+)([^>]*?)(\/?)>/g, function(all, tag, attrs, slash) {
    var cm = /\bclass\s*=\s*"([^"]*)"/.exec(attrs);
    if (!cm) return all;
    var decls = pxDecls(cm[1]);
    if (!decls.length) return all;
    var sm = /\bstyle\s*=\s*"([^"]*)"/.exec(attrs);
    var next = mergeStyle(sm ? sm[1] : "", decls);
    if (sm) attrs = attrs.replace(/\bstyle\s*=\s*"[^"]*"/, "style=\"" + next + "\"");
    else attrs += " style=\"" + next + "\"";
    return "<" + tag + attrs + slash + ">";
  });
}

function applyPxDecls(el) {
  if (!el || !el.getAttribute) return 0;
  var decls = pxDecls(el.className || el.getAttribute("class") || "");
  if (!decls.length || !el.style) return 0;
  for (var i = 0; i < decls.length; i++) {
    var bits = decls[i].split(":");
    var prop = bits[0];
    var val = bits.slice(1).join(":");
    if (prop === "width") el.style.width = val;
    else if (prop === "min-width") el.style.minWidth = val;
    else if (prop === "max-width") el.style.maxWidth = val;
    else if (prop === "height") el.style.height = val;
    else if (prop === "top") el.style.top = val;
    else if (prop === "left") el.style.left = val;
    else if (prop === "right") el.style.right = val;
    else if (prop === "bottom") el.style.bottom = val;
  }
  return decls.length;
}

function surePxEmbed() {
  return "var PX_RE=/((?:min-|max-)?(?:w|h|top|left|right|bottom))-\\[(\\d+)px\\]/g;\n"
    + "var STYLE_MAP={'w':'width','min-w':'min-width','max-w':'max-width','h':'height','top':'top','left':'left','right':'right','bottom':'bottom'};\n"
    + pxDecls.toString() + ";\n" + mergeStyle.toString() + ";\n" + surePxHtml.toString() + ";\n" + applyPxDecls.toString();
}

module.exports = {
  pxDecls: pxDecls,
  mergeStyle: mergeStyle,
  surePxHtml: surePxHtml,
  applyPxDecls: applyPxDecls,
  embed: surePxEmbed
};
