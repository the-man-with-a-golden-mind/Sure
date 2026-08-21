#!/usr/bin/env node
"use strict";
// Semantic identity: same spelling is not the same definition.
var compiler = require("./src/compiler");
var fail = 0;
function check(label, cond, extra) {
  if (cond) console.log("ok   " + label);
  else {
    console.log("FAIL " + label + (extra ? " [" + extra + "]" : ""));
    fail += 1;
  }
}

var localVsGlobal = [
  "module M",
  "x: Nat",
  "  0",
  "",
  "f(x: Nat): Nat",
  "  x",
  "",
  "g: Nat",
  "  x",
  ""
].join("\n");

var toks = compiler.idents(localVsGlobal);
function atName(lineCh) {
  // helper: find token on a line
  var lines = localVsGlobal.split("\n");
  var off = 0;
  for (var i = 0; i < lineCh.line; i++) off += lines[i].length + 1;
  return off + lineCh.ch;
}

var paramX = localVsGlobal.indexOf("f(x:") + 2;
var useParam = localVsGlobal.lastIndexOf("\n  x\n") ; // first body x in f
useParam = localVsGlobal.indexOf("  x", localVsGlobal.indexOf("f(x:"));
var globalUse = localVsGlobal.lastIndexOf("  x");
var defX = localVsGlobal.indexOf("x: Nat");

var rParam = compiler.resolve_at(localVsGlobal, paramX);
var rUseP = compiler.resolve_at(localVsGlobal, useParam + 2);
var rGlob = compiler.resolve_at(localVsGlobal, globalUse + 2);
var rDef = compiler.resolve_at(localVsGlobal, defX);
check("param is local", rParam && rParam.local);
check("param use local same binder", rUseP && rUseP.local && rUseP.binder === rParam.binder);
check("global x not local", rGlob && !rGlob.local);
check("def x global qual", rDef && !rDef.local && rDef.qual === "M.x");
check("global use is M.x", rGlob && rGlob.qual === "M.x");
check("not same def param vs global", !compiler.same_def(rParam, rGlob));

var renParam = compiler.rename_resolved(localVsGlobal, paramX, "k");
check("rename param keeps global x", renParam && /f\(k: Nat\)/.test(renParam) && /g: Nat\n  x/.test(renParam) && /x: Nat\n  0/.test(renParam));
var renGlob = compiler.rename_resolved(localVsGlobal, defX, "y");
check("rename global keeps param x", renGlob && /y: Nat\n  0/.test(renGlob) && /g: Nat\n  y/.test(renGlob) && /f\(x: Nat\)/.test(renGlob));

var a = [
  "module A exposing (foo)",
  "foo: Nat",
  "  1",
  ""
].join("\n");
var b = [
  "module B",
  "import A exposing (foo)",
  "foo: Nat",
  "  2",
  "useA: Nat",
  "  foo",
  "useQ: Nat",
  "  A.foo",
  ""
].join("\n");
var aFoo = compiler.resolve_at(a, a.indexOf("foo:"));
check("A.foo qual", aFoo && aFoo.qual === "A.foo");
var bDef = compiler.resolve_at(b, b.indexOf("foo: Nat"));
check("B.foo is B.foo", bDef && bDef.qual === "B.foo");
var bUse = compiler.resolve_at(b, b.indexOf("  foo") + 2);
check("unqual foo in B is local def", bUse && bUse.qual === "B.foo");
var bQ = compiler.resolve_at(b, b.indexOf("A.foo"));
check("A.foo qualified stays A.foo", bQ && bQ.qual === "A.foo");
check("B.foo !== A.foo", bDef && bQ && bDef.qual !== bQ.qual);

var bRen = compiler.rename_qual(b, "A.foo", "bar");
check("rename A.foo does not touch B.foo", bRen.indexOf("foo: Nat") >= 0 && bRen.indexOf("A.bar") >= 0 && !/A\.foo/.test(bRen));

var junk = compiler.resolve_at("??? !!!", 0);
check("malformed resolve null", junk == null);
var empty = compiler.rename_resolved("foo: Nat\n  0\n", 0, "");
check("empty new name rejected", empty == null);

if (fail) process.exit(1);
console.log("lsp identity passed");
