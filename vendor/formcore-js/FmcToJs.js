var fmc = require("./FormCore.js");
var HOST_SCHEMA = require("./host-schema.js");
var fs = require("fs");
var path = require("path");
var WS_FRAMES_SRC = fs.readFileSync(path.join(__dirname, "ws-frames.js"), "utf8")
  .replace(/^["']use strict["'];\s*/m, "")
  .replace(/module\.exports[\s\S]*$/, "");
var HOST_ABORT_SRC = require("./host-abort.js");
var HOST_PACK_SRC = require("./host-pack.js");

const Var = (name)           => ({ctor:"Var",name});
const Ref = (name)           => ({ctor:"Ref",name});
const Nul = ()               => ({ctor:"Nul"});
const Lam = (name,body)      => ({ctor:"Lam",name,body});
const App = (func,argm)      => ({ctor:"App",func,argm});
const Let = (name,expr,body) => ({ctor:"Let",name,expr,body});
const Eli = (prim,expr)      => ({ctor:"Eli",prim,expr});
const Ins = (prim,expr)      => ({ctor:"Ins",prim,expr});
const Chr = (chrx)           => ({ctor:"Chr",chrx});
const Str = (strx)           => ({ctor:"Str",strx});
const Nat = (natx)           => ({ctor:"Nat",natx});

var is_prim = {
  Unit     : 1,
  Bool     : 1,
  Nat      : 1,
  Int      : 1,
  Bits     : 1,
  U8       : 1,
  U16      : 1,
  U32      : 1,
  I32      : 1,
  U64      : 1,
  U128     : 1,
  U256     : 1,
  F32      : 1,
  F64      : 1,
  String   : 1,
  Buffer8  : 1,
  Buffer32 : 1,
};

var prim_types = {
  Unit: {
    inst: [[0, "null"]],
    elim: {ctag: x => '"unit"', ctor: [[]]},
    cnam: {mode: "switch", nams: ['unit']},
  },
  Bool: {
    inst: [[0, "true"], [0, "false"]],
    elim: {ctag: x => x, ctor: [[], []]},
    cnam: {mode: "if"},
  },
  Nat: {
    inst: [[0, "0n"], [1, p => "1n+"+p]],
    elim: {
      ctag: x => x+"===0n",
      ctor: [[], [x => "("+x+"-1n)"]],
    },
    cnam: {mode: "if"},
  },
  Int: {
    inst: [[2, pos => neg => pos+"-"+neg]],
    elim: {
      ctag: x => '"new"',
      ctor: [[x => "int_pos("+x+")", x => "int_neg("+x+")"]],
    },
    cnam: {mode: "switch", nams: ['new']},
  },
  Bits: {
    inst: [[0, "''"], [1, p=>p+"+'0'"], [1, p=>p+"+'1'"]],
    elim: {
      ctag: x => x+".length===0?'e':"+x+"["+x+".length-1]==='0'?'o':'i'",
      ctor: [[], [x => x+".slice(0,-1)"], [x => x+".slice(0,-1)"]],
    },
    cnam: {mode: "switch", nams: ['e', 'o', 'i']},
  },
  U8: {
    inst: [[1, x => "word_to_u8("+x+")"]],
    elim: {
      ctag: x => "'u8'",
      ctor: [[x => "u8_to_word("+x+")"]],
    },
    cnam: {mode: "switch", nams: ['u8']},
  },
  U16: {
    inst: [[1, x => "word_to_u16("+x+")"]],
    elim: {
      ctag: x => "'u16'",
      ctor: [[x => "u16_to_word("+x+")"]],
    },
    cnam: {mode: "switch", nams: ['u16']},
  },
  U32: {
    inst: [[1, x => "word_to_u32("+x+")"]],
    elim: {
      ctag: x => "'u32'",
      ctor: [[x => "u32_to_word("+x+")"]],
    },
    cnam: {mode: "switch", nams: ['u32']},
  },
  I32: {
    inst: [[1, x => "word_to_i32("+x+")"]],
    elim: {
      ctag: x => "'i32'",
      ctor: [[x => "i32_to_word("+x+")"]],
    },
    cnam: {mode: "switch", nams: ['i32']},
  },
  U64: {
    inst: [[1, x => "word_to_u64("+x+")"]],
    elim: {
      ctag: x => "'u64'",
      ctor: [[x => "u64_to_word("+x+")"]],
    },
    cnam: {mode: "switch", nams: ['u64']},
  },
  U128: {
    inst: [[1, x => "word_to_u128("+x+")"]],
    elim: {
      ctag: x => "'u128'",
      ctor: [[x => "u128_to_word("+x+")"]],
    },
    cnam: {mode: "switch", nams: ['u128']},
  },
  U256: {
    inst: [[1, x => "word_to_u256("+x+")"]],
    elim: {
      ctag: x => "'u256'",
      ctor: [[x => "u256_to_word("+x+")"]],
    },
    cnam: {mode: "switch", nams: ['u256']},
  },
  F32: {
    inst: [[1, x => "word_to_f32("+x+")"]],
    elim: {
      ctag: x => "'f32'",
      ctor: [[x => "f32_to_word("+x+")"]],
    },
    cnam: {mode: "switch", nams: ['f32']},
  },
  F64: {
    inst: [[1, x => "word_to_f64("+x+")"]],
    elim: {
      ctag: x => "'f64'",
      ctor: [[x => "f64_to_word("+x+")"]],
    },
    cnam: {mode: "switch", nams: ['f64']},
  },
  String: {
    inst: [[0,"''"], [2, h => t => "(String.fromCharCode("+h+")+"+t+")"]],
    elim: {
      ctag: x => x+".length===0",
      ctor: [[], [x => x+".charCodeAt(0)", x => x+".slice(1)"]],
    },
    cnam: {mode: "if"},
  },
  Buffer8: {
    inst: [[2, d => a => "u8array_to_buffer8("+a+")"]],
    elim: {
      ctag: x => "'b8'",
      ctor: [[x => "buffer8_to_depth("+x+")", x => "buffer8_to_u8array("+x+")"]],
    },
    cnam: {mode: "switch", nams: ['b8']},
  },
  Buffer32: {
    inst: [[2, d => a => "u32array_to_buffer32("+a+")"]],
    elim: {
      ctag: x => "'b32'",
      ctor: [[x => "buffer32_to_depth("+x+")", x => "buffer32_to_u32array("+x+")"]],
    },
    cnam: {mode: "switch", nams: ['b32']},
  },
};

var prim_funcs = {
  "Bool.not"          : [1, a=>`!${a}`],
  "Bool.and"          : [2, a=>b=>`${a}&&${b}`],
  "Bool.if"           : [3, a=>b=>c=>`${a}?${b}:${c}`],
  "Bool.or"           : [2, a=>b=>`${a}||${b}`],
  "Bits.o"            : [1, a=>`${a}+'0'`],
  "Bits.i"            : [1, a=>`${a}+'1'`],
  "Bits.concat"       : [2, a=>b=>`${b}+${a}`],
  "Bits.eql"          : [2, a=>b=>`${b}===${a}`],
  "Debug.log"         : [2, a=>b=>`(console.log(${a}),${b}())`],

  "Nat.add"           : [2, a=>b=>`${a}+${b}`],
  "Nat.sub"           : [2, a=>b=>`${a}-${b}<=0n?0n:${a}-${b}`],
  "Nat.mul"           : [2, a=>b=>`${a}*${b}`],
  "Nat.div"           : [2, a=>b=>`${b}===0n?0n:${a}/${b}`],
  "Nat.mod"           : [2, a=>b=>`${b}===0n?${a}:${a}%${b}`],
  "Nat.div_mod"       : [2, a=>b=>`${b}===0n?({_:'Pair.new','fst':0n,'snd':${a}}):({_:'Pair.new','fst':${a}/${b},'snd':${a}%${b}})`],
  "Nat.pow"           : [2, a=>b=>`${a}**${b}`],
  "Nat.ltn"           : [2, a=>b=>`${a}<${b}`],
  "Nat.lte"           : [2, a=>b=>`${a}<=${b}`],
  "Nat.eql"           : [2, a=>b=>`${a}===${b}`],
  "Nat.gte"           : [2, a=>b=>`${a}>=${b}`],
  "Nat.gtn"           : [2, a=>b=>`${a}>${b}`],
  "Nat.double"        : [1, a=>`${a}*2n`],
  "Nat.half"          : [1, a=>`${a}/2n`],
  "Nat.to_u8"         : [1, a=>`Number(${a})&0xFF`],
  "Nat.to_u16"        : [1, a=>`Number(${a})&0xFFFF`],
  "Nat.to_u32"        : [1, a=>`Number(${a})>>>0`],
  "Nat.to_u64"        : [1, a=>`${a}&0xFFFFFFFFFFFFFFFFn`],
  "Nat.to_u128"       : [1, a=>`${a}&0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn`],
  "Nat.to_u256"       : [1, a=>`${a}&0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn`],
  "Nat.to_i32"        : [1, a=>`Number(${a})`],
  "Nat.to_int"        : [1, a=>`${a}`],
  "Nat.to_bits"       : [1, a=>`nat_to_bits(${a})`],
  "Nat.read"          : [1, a=>`(()=>{var s=String(${a});return /^\\d+$/.test(s)?BigInt(s):0n;})()`],

  "Int.new"           : [2, a=>b=>a+"-"+b],
  "Int.add"           : [2, a=>b=>`${a}+${b}`],
  "Int.sub"           : [2, a=>b=>`${a}-${b}`],
  "Int.mul"           : [2, a=>b=>`${a}*${b}`],
  "Int.div"           : [2, a=>b=>`${a}/${b}`],
  "Int.pow"           : [2, a=>b=>`${a}**${b}`],
  "Int.to_i8"         : [1, a=>`Number(${a})`],
  "Int.to_i16"        : [1, a=>`Number(${a})`],
  "Int.to_i32"        : [1, a=>`Number(${a})`],
  "Int.from_nat"      : [1, a=>`${a}`],
  "Int.read"          : [1, a=>`(()=>{var s=String(${a});return /^-?\\d+$/.test(s)?BigInt(s):0n;})()`],

  "U8.add"           : [2, a=>b=>`(${a}+${b})&0xFF`],
  "U8.not"           : [1, a=>`((~${a})&0xFF)>>>0`],
  "U8.and"           : [2, a=>b=>`${a}&${b}`],
  "U8.div"           : [2, a=>b=>`(${a}/${b})>>>0`],
  "U8.eql"           : [2, a=>b=>`${a}===${b}`],
  "U8.gte"           : [2, a=>b=>`${a}>=${b}`],
  "U8.gtn"           : [2, a=>b=>`${a}>${b}`],
  "U8.inc"           : [1, a=>`(${a}+1)&0xFF`],
  "U8.length"        : [1, a=>`(${a}.length)&0xFF`],
  "U8.lte"           : [2, a=>b=>`${a}<=${b}`],
  "U8.ltn"           : [2, a=>b=>`${a}<${b}`],
  "U8.mod"           : [2, a=>b=>`${a}%${b}`],
  "U8.mul"           : [2, a=>b=>`(${a}*${b})&0xFF`],
  "U8.or"            : [2, a=>b=>`${a}|${b}`],
  "U8.pow"           : [2, a=>b=>`(${a}**${b})&0xFF`],
  "U8.read_base"     : [2, a=>b=>`parseInt(${b},${a})&0xFF`],
  "U8.shl"           : [2, a=>b=>`(${a}<<${b})&0xFF`],
  "U8.show"          : [1, a=>`String(${a})`],
  "U8.shr"           : [2, a=>b=>`${a}>>>${b}`],
  "U8.slice"         : [3, a=>b=>c=>`${c}.slice(${a},${b})`],
  "U8.sqrt"          : [1, a=>`Math.sqrt(${a})&0xFF`],
  "U8.sub"           : [2, a=>b=>`(${a}-${b})&0xFF`],
  "U8.to_f64"        : [1, a=>`${a}`],
  "U8.to_nat"        : [1, a=>`BigInt(${a})`],
  "U8.to_i32"        : [1, a=>`${a}`],
  "U8.to_u8"         : [1, a=>`${a}`],
  "U8.to_u16"        : [1, a=>`${a}`],
  "U8.to_u32"        : [1, a=>`${a}`],
  "U8.to_u64"        : [1, a=>`BigInt(${a})`],
  "U8.to_u128"       : [1, a=>`BigInt(${a})`],
  "U8.to_u256"       : [1, a=>`BigInt(${a})`],
  "U8.xor"           : [2, a=>b=>`${a}^${b}`],
  "U8.read"          : [1, a=>`parseInt(${a})`],
  "U8.from_nat"      : [1, a=>`Number(${a})&0xFF`],

  "U16.add"           : [2, a=>b=>`(${a}+${b})&0xFFFF`],
  "U16.not"           : [1, a=>`((~${a})&0xFFFF)>>>0`],
  "U16.and"           : [2, a=>b=>`${a}&${b}`],
  "U16.div"           : [2, a=>b=>`(${a}/${b})>>>0`],
  "U16.eql"           : [2, a=>b=>`${a}===${b}`],
  "U16.gte"           : [2, a=>b=>`${a}>=${b}`],
  "U16.gtn"           : [2, a=>b=>`${a}>${b}`],
  "U16.inc"           : [1, a=>`(${a}+1)&0xFFFF`],
  "U16.length"        : [1, a=>`(${a}.length)&0xFFFF`],
  "U16.lte"           : [2, a=>b=>`${a}<=${b}`],
  "U16.ltn"           : [2, a=>b=>`${a}<${b}`],
  "U16.mod"           : [2, a=>b=>`${a}%${b}`],
  "U16.mul"           : [2, a=>b=>`(${a}*${b})&0xFFFF`],
  "U16.or"            : [2, a=>b=>`${a}|${b}`],
  "U16.pow"           : [2, a=>b=>`(${a}**${b})&0xFFFF`],
  "U16.read_base"     : [2, a=>b=>`parseInt(${b},${a})&0xFFFF`],
  "U16.shl"           : [2, a=>b=>`(${a}<<${b})&0xFFFF`],
  "U16.show"          : [1, a=>`String(${a})`],
  "U16.shr"           : [2, a=>b=>`${a}>>>${b}`],
  "U16.slice"         : [3, a=>b=>c=>`${c}.slice(${a},${b})`],
  "U16.sqrt"          : [1, a=>`Math.sqrt(${a})&0xFFFF`],
  "U16.sub"           : [2, a=>b=>`(${a}-${b})&0xFFFF`],
  "U16.to_f64"        : [1, a=>`${a}`],
  "U16.to_nat"        : [1, a=>`BigInt(${a})`],
  "U16.to_i32"        : [1, a=>`${a}`],
  "U16.to_u8"         : [1, a=>`${a}`],
  "U16.to_u16"        : [1, a=>`${a}`],
  "U16.to_u32"        : [1, a=>`${a}`],
  "U16.to_u64"        : [1, a=>`BigInt(${a})`],
  "U16.to_u128"       : [1, a=>`BigInt(${a})`],
  "U16.to_u256"       : [1, a=>`BigInt(${a})`],
  "U16.xor"           : [2, a=>b=>`${a}^${b}`],
  "U16.to_bits"       : [1, a=>`u16_to_bits(${a})`],
  "U16.read"          : [1, a=>`parseInt(${a})`],
  "U16.from_nat"      : [1, a=>`Number(${a})&0xFFFF`],

  "U32.add"           : [2, a=>b=>`(${a}+${b})>>>0`],
  "U32.not"           : [1, a=>`(~${a})>>>0`],
  "U32.and"           : [2, a=>b=>`${a}&${b}`],
  "U32.div"           : [2, a=>b=>`(${a}/${b})>>>0`],
  "U32.eql"           : [2, a=>b=>`${a}===${b}`],
  "U32.for"           : [4, a=>b=>c=>d=>`u32_for(${a},${b},${c},${d})`],
  "U32.gte"           : [2, a=>b=>`${a}>=${b}`],
  "U32.gtn"           : [2, a=>b=>`${a}>${b}`],
  "U32.inc"           : [1, a=>`(${a}+1)>>>0`],
  "U32.length"        : [1, a=>`(${a}.length)>>>0`],
  "U32.log"           : [1, a=>`Math.log10(${a}.length)>>>0`],
  "U32.lte"           : [2, a=>b=>`${a}<=${b}`],
  "U32.ltn"           : [2, a=>b=>`${a}<${b}`],
  "U32.mod"           : [2, a=>b=>`${a}%${b}`],
  "U32.mul"           : [2, a=>b=>`(${a}*${b})>>>0`],
  "U32.or"            : [2, a=>b=>`${a}|${b}`],
  "U32.pow"           : [2, a=>b=>`(${a}**${b})>>>0`],
  "U32.read_base"     : [2, a=>b=>`parseInt(${b},${a})`],
  "U32.shl"           : [2, a=>b=>`(${a}<<${b})>>>0`],
  "U32.show"          : [1, a=>`String(${a})`],
  "U32.shr"           : [2, a=>b=>`${a}>>>${b}`],
  "U32.slice"         : [3, a=>b=>c=>`${c}.slice(${a},${b})`],
  "U32.sqrt"          : [1, a=>`Math.sqrt(${c})>>>0`],
  "U32.sub"           : [2, a=>b=>`(${a}-${b})>>>0`],
  "U32.to_f64"        : [1, a=>`${a}`],
  "U32.to_nat"        : [1, a=>`BigInt(${a})`],
  "U32.to_i32"        : [1, a=>`${a}`],
  "U32.to_u8"         : [1, a=>`${a}`],
  "U32.to_u16"        : [1, a=>`${a}`],
  "U32.to_u32"        : [1, a=>`${a}`],
  "U32.to_u64"        : [1, a=>`BigInt(${a})`],
  "U32.to_u128"       : [1, a=>`BigInt(${a})`],
  "U32.to_u256"       : [1, a=>`BigInt(${a})`],
  "U32.xor"           : [2, a=>b=>`(${a}^${b})>>>0`],
  "U32.read"          : [1, a=>`parseInt(${a})`],
  "U32.from_nat"      : [1, a=>`Number(${a})>>>0`],

  "U64.add"           : [2, a=>b=>`(${a}+${b})&0xFFFFFFFFFFFFFFFFn`],
  "U64.and"           : [2, a=>b=>`${a}&${b}`],
  "U64.div"           : [2, a=>b=>`(${a}/${b})&0xFFFFFFFFFFFFFFFFn`],
  "U64.eql"           : [2, a=>b=>`${a}===${b}`],
  "U64.gte"           : [2, a=>b=>`${a}>=${b}`],
  "U64.gtn"           : [2, a=>b=>`${a}>${b}`],
  "U64.inc"           : [1, a=>`(${a}+1)&0xFFFFFFFFFFFFFFFFn`],
  "U64.length"        : [1, a=>`(${a}.length)&0xFFFFFFFFFFFFFFFFn`],
  "U64.lte"           : [2, a=>b=>`${a}<=${b}`],
  "U64.ltn"           : [2, a=>b=>`${a}<${b}`],
  "U64.mod"           : [2, a=>b=>`${a}%${b}`],
  "U64.mul"           : [2, a=>b=>`(${a}*${b})&0xFFFFFFFFFFFFFFFFn`],
  "U64.or"            : [2, a=>b=>`${a}|${b}`],
  "U64.pow"           : [2, a=>b=>`(${a}**${b})&0xFFFFFFFFFFFFFFFFn`],
  "U64.shl"           : [2, a=>b=>`(${a}<<${b})&0xFFFFFFFFFFFFFFFFn`],
  "U64.show"          : [1, a=>`String(${a})`],
  "U64.shr"           : [2, a=>b=>`${a}>>${b}`],
  "U64.sub"           : [2, a=>b=>`(${a}-${b})&0xFFFFFFFFFFFFFFFFn`],
  "U64.to_f64"        : [1, a=>`Number(${a})`],
  "U64.to_nat"        : [1, a=>`${a}`],
  "U64.to_u8"         : [1, a=>`Number(${a}&0xFFn)`],
  "U64.to_u16"        : [1, a=>`Number(${a}&0xFFFFn)`],
  "U64.to_u32"        : [1, a=>`Number(${a}&0xFFFFFFFFn)`],
  "U64.to_u64"        : [1, a=>`${a}`],
  "U64.to_u128"       : [1, a=>`${a}`],
  "U64.to_u256"       : [1, a=>`${a}`],
  "U64.xor"           : [2, a=>b=>`${a}^${b}`],
  "U64.read"          : [1, a=>`BigInt(${a})`],
  "U64.from_nat"      : [1, a=>`${a}&0xFFFFFFFFFFFFFFFFn`],

  "U256.add"           : [2, a=>b=>`(${a}+${b})&0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn`],
  "U256.and"           : [2, a=>b=>`${a}&${b}`],
  "U256.div"           : [2, a=>b=>`(${a}/${b})&0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn`],
  "U256.eql"           : [2, a=>b=>`${a}===${b}`],
  "U256.gte"           : [2, a=>b=>`${a}>=${b}`],
  "U256.gtn"           : [2, a=>b=>`${a}>${b}`],
  "U256.inc"           : [1, a=>`(${a}+1)&0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn`],
  "U256.length"        : [1, a=>`(${a}.length)&0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn`],
  "U256.lte"           : [2, a=>b=>`${a}<=${b}`],
  "U256.ltn"           : [2, a=>b=>`${a}<${b}`],
  "U256.mod"           : [2, a=>b=>`${a}%${b}`],
  "U256.mul"           : [2, a=>b=>`(${a}*${b})&0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn`],
  "U256.or"            : [2, a=>b=>`${a}|${b}`],
  "U256.pow"           : [2, a=>b=>`(${a}**${b})&0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn`],
  "U256.shl"           : [2, a=>b=>`(${a}<<${b})&0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn`],
  "U256.show"          : [1, a=>`String(${a})`],
  "U256.shr"           : [2, a=>b=>`${a}>>${b}`],
  "U256.sub"           : [2, a=>b=>`(${a}-${b})&0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn`],
  "U256.to_f64"        : [1, a=>`${a}`],
  "U256.to_nat"        : [1, a=>`${a}`],
  "U256.to_u8"         : [1, a=>`Number(${a}&0xFFn)`],
  "U256.to_u16"        : [1, a=>`Number(${a}&0xFFFFn)`],
  "U256.to_u32"        : [1, a=>`Number(${a}&0xFFFFFFFFn)`],
  "U256.to_u64"        : [1, a=>`${a}`],
  "U256.to_u128"       : [1, a=>`${a}`],
  "U256.to_u256"       : [1, a=>`${a}`],
  "U256.xor"           : [2, a=>b=>`${a}^${b}`],
  "U256.read"          : [1, a=>`BigInt(${a})`],
  "U256.from_nat"      : [1, a=>`${a}&0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFn`],

  "I32.add"           : [2, a=>b=>`(${a}+${b})>>0`],
  "I32.sub"           : [2, a=>b=>`(${a}-${b})>>0`],
  "I32.mul"           : [2, a=>b=>`(${a}*${b})>>0`],
  "I32.div"           : [2, a=>b=>`(${a}/${b})>>0`],
  "I32.mod"           : [2, a=>b=>`${a}%${b}`],
  "I32.neg"           : [1, a=>`(-${a})`],
  "I32.pow"           : [2, a=>b=>`(${a}**${b})>>0`],
  "I32.ltn"           : [2, a=>b=>`${a}<${b}`],
  "I32.lte"           : [2, a=>b=>`${a}<=${b}`],
  "I32.eql"           : [2, a=>b=>`${a}===${b}`],
  "I32.gte"           : [2, a=>b=>`${a}>=${b}`],
  "I32.gtn"           : [2, a=>b=>`${a}>${b}`],
  "I32.shr"           : [2, a=>b=>`${a}>>${b}`],
  "I32.shl"           : [2, a=>b=>`${a}<<${b}`],
  "I32.and"           : [2, a=>b=>`${a}&${b}`],
  "I32.or"            : [2, a=>b=>`${a}|${b}`],
  "I32.xor"           : [2, a=>b=>`${a}^${b}`],
  "I32.slice"         : [3, a=>b=>c=>`${c}.slice(${a},${b})`],
  "I32.read_base"     : [2, a=>b=>`parseInt(${b},${a})`],
  "I32.length"        : [1, a=>`${a}.length`],
  "I32.for"           : [4, a=>b=>c=>d=>`i32_for(${a},${b},${c},${d})`],
  "I32.to_f64"        : [1, a=>`${a}`],
  "I32.read"          : [1, a=>`parseInt(${a})`],
  "I32.from_nat"      : [1, a=>`Number(${a})`],

  "F64.add"           : [2, a=>b=>`${a}+${b}`],
  "F64.sub"           : [2, a=>b=>`${a}-${b}`],
  "F64.mul"           : [2, a=>b=>`${a}*${b}`],
  "F64.div"           : [2, a=>b=>`${a}/${b}`],
  "F64.mod"           : [2, a=>b=>`${a}%${b}`],
  "F64.pow"           : [2, a=>b=>`${a}**${b}`],
  "F64.parse"         : [1, a=>`parseFloat(${a})`],
  "F64.read"          : [1, a=>`parseFloat(${a})`],
  "F64.log"           : [1, a=>`Math.log(${a})`],
  "F64.cos"           : [1, a=>`Math.cos(${a})`],
  "F64.sin"           : [1, a=>`Math.sin(${a})`],
  "F64.tan"           : [1, a=>`Math.tan(${a})`],
  "F64.acos"          : [1, a=>`Math.acos(${a})`],
  "F64.asin"          : [1, a=>`Math.asin(${a})`],
  "F64.atan"          : [1, a=>`Math.atan(${a})`],
  "F64.to_u32"        : [1, a=>`(${a}>>>0)`],
  "F64.to_i32"        : [1, a=>`(${a}>>0)`],
  "F64.parse"         : [1, a=>`parseFloat(${a})`],
  "F64.read"          : [1, a=>`parseFloat(${a})`],
  "F64.make"          : [3, a=>b=>c=>`f64_make(${a},${b},${c})`],
  "F64.from_nat"      : [1, a=>`Number(${a})`],
  "F64.show"          : [1, a=>`String(${a})`],
  "F64.round"         : [1, a=>`Math.round(${a})`],
  "F64.ceil"          : [1, a=>`Math.ceil(${a})`],
  "F64.floor"         : [1, a=>`Math.floor(${a})`],
  "F64.atan2"         : [2, a=>b=>`Math.atan2(${a},${b})`],
  "Word.to_f64"       : [2, s=>a=>`word_bits_to_uint(${a})`],
  "Word.s_to_f64"     : [2, s=>a=>`word_bits_to_sint(${a})`],
  "F64.sqrt"          : [1, a=>`Math.sqrt(${a})`],
  "F64.exp"           : [1, a=>`Math.exp(${a})`],
  "F32.add"           : [2, a=>b=>`Math.fround(${a}+${b})`],
  "F32.sub"           : [2, a=>b=>`Math.fround(${a}-${b})`],
  "F32.mul"           : [2, a=>b=>`Math.fround(${a}*${b})`],
  "F32.div"           : [2, a=>b=>`Math.fround(${a}/${b})`],
  "F32.mod"           : [2, a=>b=>`Math.fround(${a}%${b})`],
  "F32.pow"           : [2, a=>b=>`Math.fround(${a}**${b})`],
  "F32.parse"         : [1, a=>`Math.fround(parseFloat(${a}))`],
  "F32.log"           : [1, a=>`Math.fround(Math.log(${a}))`],
  "F32.cos"           : [1, a=>`Math.fround(Math.cos(${a}))`],
  "F32.sin"           : [1, a=>`Math.fround(Math.sin(${a}))`],
  "F32.tan"           : [1, a=>`Math.fround(Math.tan(${a}))`],
  "F32.acos"          : [1, a=>`Math.fround(Math.acos(${a}))`],
  "F32.asin"          : [1, a=>`Math.fround(Math.asin(${a}))`],
  "F32.atan"          : [2, a=>b=>`Math.fround(Math.atan2(${a},${b}))`],
  "F32.to_u32"        : [1, a=>`(${a}>>>0)`],
  "F32.round"         : [1, a=>`Math.fround(Math.round(${a}))`],
  "F32.ceil"          : [1, a=>`Math.fround(Math.ceil(${a}))`],
  "F32.floor"         : [1, a=>`Math.fround(Math.floor(${a}))`],
  "F32.sqrt"          : [1, a=>`Math.fround(Math.sqrt(${a}))`],
  "F32.exp"           : [1, a=>`Math.fround(Math.exp(${a}))`],
  "F32.min"           : [2, a=>b=>`Math.fround(Math.min(${a},${b}))`],
  "F32.max"           : [2, a=>b=>`Math.fround(Math.max(${a},${b}))`],
  "F32.ltn"           : [2, a=>b=>`${a}<${b}`],
  "F32.lte"           : [2, a=>b=>`${a}<=${b}`],
  "F32.eql"           : [2, a=>b=>`${a}===${b}`],
  "F32.gte"           : [2, a=>b=>`${a}>=${b}`],
  "F32.gtn"           : [2, a=>b=>`${a}>${b}`],
  "F64.ltn"           : [2, a=>b=>`${a}<${b}`],
  "F64.lte"           : [2, a=>b=>`${a}<=${b}`],
  "F64.eql"           : [2, a=>b=>`${a}===${b}`],
  "F64.gte"           : [2, a=>b=>`${a}>=${b}`],
  "F64.gtn"           : [2, a=>b=>`${a}>${b}`],

  "Buffer8.set"       : [3, a=>b=>c=>`(${c}[${a}]=${b},${c})`],
  "Buffer8.get"       : [2, a=>b=>`(${b}[${a}])`],
  "Buffer8.alloc"     : [1, a=>`new Uint8Array(2 ** Number(${a}))`],

  "Buffer32.set"      : [3, a=>b=>c=>`(${c}[${a}]=${b},${c})`],
  "Buffer32.get"      : [2, a=>b=>`(${b}[${a}])`],
  "Buffer32.alloc"    : [1, a=>`new Uint32Array(2 ** Number(${a}))`],

  "VoxBox.set_col"    : [3, a=>b=>c=>`(${c}.buffer[${a}*2+1]=${b},${c})`],
  "VoxBox.set_pos"    : [3, a=>b=>c=>`(${c}.buffer[${a}*2]=${b},${c})`],
  "VoxBox.set"        : [4, a=>b=>c=>d=>`(${d}.buffer[${a}*2]=${b},${d}.buffer[${a}*2+1]=${c},${d})`],
  "VoxBox.push"       : [3, a=>b=>c=>`(${c}.buffer[${c}.length*2]=${a},${c}.buffer[${c}.length*2+1]=${b},${c}.length++,${c})`],
  "VoxBox.get_pos"    : [2, a=>b=>`(${b}.buffer[${a}*2])`],
  "VoxBox.get_col"    : [2, a=>b=>`(${b}.buffer[${a}*2+1])`],

  "String.eql"        : [2, a=>b=>`${a}===${b}`],
  "String.concat"     : [2, a=>b=>`${a}+${b}`],
  "Equal.cast"        : [1, a=>a],
  "Pos32.new"         : [3, a=>b=>c=>`(0|${a}|(${b}<<12)|(${c}<<24))`],
  "Pos32.get_x"       : [1, a=>`(${a}&0xFFF)`],
  "Pos32.get_y"       : [1, a=>`((${a}>>>12)&0xFFF)`],
  "Pos32.get_z"       : [1, a=>`(${a}>>>24)`],
  "Col32.get_a"       : [1, a=>`((${a}>>>24)&0xFF)`],
  "Col32.get_b"       : [1, a=>`((${a}>>>16)&0xFF)`],
  "Col32.get_g"       : [1, a=>`((${a}>>>8)&0xFF)`],
  "Col32.get_r"       : [1, a=>`(${a}&0xFF)`],
  "Col32.new"         : [4, a=>b=>c=>d=>`(0|${a}|(${b}<<8)|(${c}<<16)|(${d}<<24))`],
  "Fm.Name.to_bits"   : [1, a=>`fm_name_to_bits(${a})`],
  "Kind.Name.to_bits" : [1, a=>`kind_name_to_bits(${a})`],
  "Sure.Name.to_bits" : [1, a=>`kind_name_to_bits(${a})`],
  "List.for"          : [3, a=>b=>c=>`list_for(${a})(${b})(${c})`],
  "List.length"       : [1, a=>`list_length(${a})`],
  "Set.mut.new"       : [1, a=>`({})`],
  "Set.mut.set"       : [2, a=>b=>`((k,s)=>((s[k]=true),s))(${a},${b})`],
  "Set.mut.has"       : [2, a=>b=>`!!(${b}[${a}])`],
  "Set.mut.del"       : [2, a=>b=>`((k,s)=>((delete s[k]),s))(${a},${b})`],

  "BitsMap.set"       : [3, a=>b=>c=>`bitsmap_set(${a},${b},${c},'set')`],
  "BitsMap.get"       : [2, a=>b=>`bitsmap_get(${a},${b})`],
  "BitsMap.del"       : [2, a=>b=>`bitsmap_set(${a},null,${b},'del')`],
  "BitsMap.ini"       : [3, a=>b=>c=>`bitsmap_ini(${a},${b},${c},'ini')`],
};

function stringify(term) {
  switch (term.ctor) {
    case "Var": return term.name;
    case "Ref": return term.name;
    case "Nul": return "null";
    case "Lam": return "λ"+term.name+"."+stringify(term.body);
    case "App": return "("+stringify(term.func)+" "+stringify(term.argm)+")";
    case "Let": return "$"+term.name+"="+stringify(term.expr)+";"+stringify(term.body);
    case "Eli": return "-"+stringify(term.expr);
    case "Ins": return "+"+stringify(term.expr);
    case "Chr": return "'"+term.chrx+"'";
    case "Str": return '"'+term.strx+'"';
    case "Nat": return term.natx;
    default: return "?";
  };
};

function as_adt(term, defs) {
  var term = fmc.reduce(term, defs);
  if (term.ctor === "All" && term.self.slice(-5) === ".Self") {
    var term = term.body(fmc.Var("self",0), fmc.Var("P",0));
    var ctrs = [];
    while (term.ctor === "All") {
      var ctr = (function go(term, flds) {
        if (term.ctor === "All") {
          var flds = term.eras ? flds : flds.concat(term.name);
          return go(term.body(fmc.Var("",0), fmc.Var(term.name,0)), flds);
        } else if (term.ctor === "App") {
          var func = term.func;
          while (func.ctor === "App") {
            func = func.func;
          }
          if (func.ctor === "Var" && func.name === "P") {
            var argm = term.argm;
            while (argm.ctor === "App") {
              argm = argm.func;
            };
            if (argm.ctor === "Ref") {
              return {name: argm.name, flds: flds};
            }
          }
        }
        return null;
      })(term.bind, []);
      if (ctr) {
        ctrs.push(ctr);
        term = term.body(fmc.Var(term.self,0), fmc.Var(term.name,0));
      } else {
        return null;
      }
    }
    return ctrs;
  }
  return null;
};

function dependency_sort(defs, main) {
  var seen = {};
  var refs = [];
  function go(term) {
    if (!term) return;
    switch (term.ctor) {
      case "Ref":
        if (!seen[term.name]) {
          seen[term.name] = true;
          if (!defs[term.name] || !defs[term.name].term) break;
          go(defs[term.name].term);
          refs.push(term.name);
        }
        break;
      case "Lam":
        go(term.body(fmc.Var(term.name,0)));
        break;
      case "App":
        go(term.func);
        go(term.argm);
        break;
      case "Let":
        go(term.expr);
        go(term.body(fmc.Var(term.name,0)));
        break;
      case "Def":
        go(term.expr);
        go(term.body(fmc.Var(term.name,0)));
        break;
      case "Ann":
        go(term.expr);
        break;
      case "Loc":
        go(term.expr);
        break;
      case "Eli":
        go(term.expr);
        break;
      case "Ins":
        go(term.expr);
        break;
      case "Nat":
        break;
      case "Chr":
        break;
      case "Str":
        break;
      default:
        break;
    };
  };
  if (!defs[main]) return refs;
  go(defs[main].term);
  if (refs.indexOf(main) === -1) refs.push(main);
  return refs;
};

// Host IO.ask query -> runtime slice. Unknown / computed queries keep every slice.
var HOST_QUERY_GROUP = HOST_SCHEMA.queries;

function all_host_need() {
  return {
    core: 1, file: 1, http: 1, job: 1, dns: 1, tcp: 1, ws: 1, zlib: 1,
    server: 1, sse: 1, ffi: 1, worker: 1, proc: 1, db: 1, udp: 1, crypto: 1
  };
}

function host_need_from_queries(queries, dynamic) {
  if (dynamic) return all_host_need();
  var n = {
    core: 1, file: 0, http: 0, job: 0, dns: 0, tcp: 0, ws: 0, zlib: 0,
    server: 0, sse: 0, ffi: 0, worker: 0, proc: 0, db: 0, udp: 0, crypto: 0
  };
  for (var q in queries) {
    if (!queries[q]) continue;
    var g = HOST_QUERY_GROUP[q];
    if (!g) return all_host_need();
    n[g] = 1;
  }
  if (n.sse) n.server = 1;
  if (n.ws) n.tcp = 1;
  if (n.job) n.http = 1;
  return n;
}

function peel_apps(term) {
  var args = [];
  while (term && term.ctor === "App") {
    args.unshift(term.argm);
    term = term.func;
  }
  return {head: term, args: args};
}

function walk_runtime_term(term, on) {
  if (!term) return;
  on(term);
  switch (term.ctor) {
    case "Lam":
      walk_runtime_term(term.body(fmc.Var(term.name, 0)), on);
      break;
    case "App":
      walk_runtime_term(term.func, on);
      walk_runtime_term(term.argm, on);
      break;
    case "Let":
    case "Def":
      walk_runtime_term(term.expr, on);
      walk_runtime_term(term.body(fmc.Var(term.name, 0)), on);
      break;
    case "Ann":
    case "Loc":
    case "Eli":
    case "Ins":
      walk_runtime_term(term.expr, on);
      break;
    default:
      break;
  }
}

function collect_host_need(defs, nams) {
  var queries = {};
  var dynamic = false;
  function consider(term) {
    var p = peel_apps(term);
    // IO.ask is ∀A. String -> String -> (String -> IO A) -> IO A
    // so args[0] is the type, args[1] is the query.
    if (p.head && p.head.ctor === "Ref" && p.head.name === "IO.ask" && p.args.length >= 2) {
      var q = p.args[1];
      if (q && q.ctor === "Str") queries[q.strx] = 1;
      else dynamic = true;
    }
    if (term.ctor === "Str" && HOST_QUERY_GROUP[term.strx]) queries[term.strx] = 1;
  }
  for (var i = 0; i < nams.length; i++) {
    var d = defs[nams[i]];
    if (d && d.term) walk_runtime_term(d.term, consider);
  }
  return host_need_from_queries(queries, dynamic);
}

function collect_prim_use(defs, nams) {
  var types = {};
  var funcs = {};
  function go(term) {
    if (!term) return;
    switch (term.ctor) {
      case "Eli":
      case "Ins":
        if (term.prim) types[term.prim] = 1;
        go(term.expr);
        break;
      case "Ref":
        if (prim_funcs[term.name]) funcs[term.name] = 1;
        if (prim_types[term.name]) types[term.name] = 1;
        break;
      case "Lam":
        go(term.body(fmc.Var(term.name, 0)));
        break;
      case "App":
        go(term.func);
        go(term.argm);
        break;
      case "Let":
      case "Def":
        go(term.expr);
        go(term.body(fmc.Var(term.name, 0)));
        break;
      case "Ann":
      case "Loc":
        go(term.expr);
        break;
      default:
        break;
    }
  }
  for (var i = 0; i < nams.length; i++) {
    var name = nams[i];
    if (prim_funcs[name]) funcs[name] = 1;
    if (prim_types[name]) types[name] = 1;
    var d = defs[name];
    if (d && d.term) go(d.term);
  }
  return {types: types, funcs: funcs};
}

function shake_defs(defs, main) {
  var nams = dependency_sort(defs, main);
  var kept = {};
  for (var i = 0; i < nams.length; i++) {
    if (defs[nams[i]]) kept[nams[i]] = defs[nams[i]];
  }
  return {defs: kept, nams: nams};
}

function shake_code(code, name) {
  var defs = fmc.parse_defs(code);
  var shaken = shake_defs(defs, name);
  return fmc.show_defs(shaken.defs);
}

function prim_of(type, defs) {
  for (var prim in is_prim) {
    if (fmc.equal(type, fmc.Ref(prim), defs)) {
      return prim;
    }
  };
  return null;
};

// Note:
// The name of bound variables get a '$depth$' appended to it. This helps making
// them unique, but also solves some issues where JavaScript shadowing behavior
// differs from Kind. For example:
// `foo = x => y => { var x = x * x; return x; }`
// Here, calling `foo(2)(2)` would return `NaN`, not `4`, because the outer
// value of `x` isn't accessible inside the function's body due to the
// declaration of `x` using a `var` statement.

function infer(term, defs, ctx = fmc.Nil()) {
  switch (term.ctor) {
    case "Var":
      return {
        comp: Var(term.name+"$"+term.indx),
        type: fmc.Var(term.name,term.indx),
      };
    case "Ref":
      var got_def = defs[term.name];
      return {
        comp: Ref(term.name),
        type: got_def.type,
      };
    case "Typ":
      return {
        comp: Nul(),
        type: fmc.Typ(),
      };
    case "App":
      var func_cmp = infer(term.func, defs, ctx);
      var func_typ = fmc.reduce(func_cmp.type, defs);
      switch (func_typ.ctor) {
        case "All":
          var self_var = fmc.Ann(true, term.func, func_typ);
          var name_var = fmc.Ann(true, term.argm, func_typ.bind);
          var argm_cmp = check(term.argm, func_typ.bind, defs, ctx);
          var term_typ = func_typ.body(self_var, name_var);
          var comp = func_cmp.comp;
          var func_typ_adt = as_adt(func_typ, defs);
          var func_typ_prim = prim_of(func_typ, defs);
          if (func_typ_prim) {
            comp = Eli(func_typ_prim, comp);
          } else if (func_typ_adt) {
            comp = Eli(func_typ_adt, comp);
          };
          if (!func_typ.eras) {
            comp = App(comp, argm_cmp.comp);
          }
          return {comp, type: term_typ};
        default:
          throw "Non-function application.";
      };
    case "Let":
      var expr_cmp = infer(term.expr, defs, ctx);
      var expr_var = fmc.Ann(true, fmc.Var("_"+term.name, ctx.size+1), expr_cmp.type);
      var body_ctx = fmc.Ext({name:term.name,type:expr_var.type}, ctx);
      var body_cmp = infer(term.body(expr_var), defs, body_ctx);
      return {
        comp: Let("_"+term.name+"$"+(ctx.size+1), expr_cmp.comp, body_cmp.comp),
        type: body_cmp.type,
      };
    case "Def":
      return infer(term.body(term.expr), defs, ctx);
    case "All":
      return {
        comp: Nul(),
        type: fmc.Typ(),
      };
    case "Ann":
      return check(term.expr, term.type, defs, ctx);
    case "Loc":
      return infer(term.expr, defs, ctx);
    case "Nat":
      return {
        comp: Nat(term.natx),
        type: fmc.Ref("Nat"),
      };
    case "Chr":
      return {
        comp: Chr(term.chrx),
        type: fmc.Ref("Char"),
      };
    case "Str":
      return {
        comp: Str(term.strx),
        type: fmc.Ref("String"),
      };
  }
};

function check(term, type, defs, ctx = fmc.Nil()) {
  var typv = fmc.reduce(type, defs);

  if (typv.ctor === "Typ") {
    var comp = Nul();
    var type = fmc.Typ();
    return {comp, type};
  };

  var comp = null;
  switch (term.ctor) {
    case "Lam":
      if (typv.ctor === "All") {
        var self_var = fmc.Ann(true, term, type);
        var name_var = fmc.Ann(true, fmc.Var("_"+term.name, ctx.size+1), typv.bind);
        var body_typ = typv.body(self_var, name_var);
        var body_ctx = fmc.Ext({name:term.name,type:name_var.type}, ctx);
        var body_cmp = check(term.body(name_var), body_typ, defs, body_ctx);
        if (typv.eras) {
          comp = body_cmp.comp;
        } else {
          comp = Lam("_"+term.name+"$"+(ctx.size+1), body_cmp.comp);
        }
        var type_adt = as_adt(type, defs);
        var type_prim = prim_of(type, defs);
        if (type_prim) {
          comp = Ins(type_prim, comp);
        } else if (type_adt) {
          comp = Ins(type_adt, comp);
        }
      } else {
        throw "Lambda has non-function type.";
      }
      return {comp, type};
    case "Let":
      //console.log("?????", term.expr);
      var expr_cmp = infer(term.expr, defs, ctx);
      var expr_var = fmc.Ann(true, fmc.Var("_"+term.name, ctx.size+1), expr_cmp.type);
      var body_ctx = fmc.Ext({name:term.name,type:expr_var.type}, ctx);
      var body_cmp = check(term.body(expr_var), type, defs, body_ctx);
      return {
        comp: Let("_"+term.name+"$"+(ctx.size+1), expr_cmp.comp, body_cmp.comp),
        type: body_cmp.type,
      };
    case "Loc":
      return check(term.expr, type, defs);
    default:
      var term_cmp = infer(term, defs, ctx);
      var comp = term_cmp.comp;
      return {comp, type};
  };
};

function core_to_comp(defs, main) {
  var comp_nams = dependency_sort(defs, main);
  if (comp_nams.indexOf(main) === -1) comp_nams.push(main);
  var comp_defs = {};
  for (var name of comp_nams) {
    //TODO: caution, using fml.unloc on fmc term; consider adding fmc.unloc
    comp_defs[name] = check(defs[name].term, defs[name].type, defs).comp;
  };
  return {
    defs: comp_defs,
    nams: comp_nams,
  };
};

function adt_type(adt) {
  var inst = [];
  var elim = {
    ctag: x => x+"._",
    ctor: [],
  };
  var cnam = [];
  for (let i = 0; i < adt.length; ++i) {
    inst.push([adt[i].flds.length, (function go(j, ctx) {
      if (j < adt[i].flds.length) {
        return x => go(j + 1, ctx.concat([x]));
      } else {
        var res = "({_:'"+adt[i].name+"'";
        for (var k = 0; k < j; ++k) {
          res += ",'"+adt[i].flds[k]+"':"+ctx[k];
        };
        res += "})";
        return res;
      };
    })(0, [])]);
    elim.ctor.push(adt[i].flds.map((n,j) => (x => x+"."+adt[i].flds[j])));
    cnam.push(adt[i].name);
  };
  var cnam = {mode: "switch", nams: cnam};
  return {inst, elim, cnam};
};

var count = 0;
function fresh() {
  return "$"+(count++);
};

// Simple substitution, assumes `name` is globally unique.
function subst(term, name, val) {
  switch (term.ctor) {
    case "Var": return term.name === name ? val : term;
    case "Ref": return Ref(term.name);
    case "Lam": return Lam(term.name, term.name === name ? term.body : subst(term.body, name, val));
    case "App": return App(subst(term.func, name, val), subst(term.argm, name, val));
    case "Let": return Let(term.name, subst(term.expr, name, val), term.name === name ? term.body : subst(term.body, name, val));
    case "Eli": return Eli(term.prim, subst(term.expr, name, val));
    case "Ins": return Ins(term.prim, subst(term.expr, name, val));
    default: return term;
  }
};

function serialize(term) {
  switch (term.ctor) {
    case "Var": return "{"+term.name+"}";
    case "Ref": return "{"+term.name+"}";
    case "Nul": return "%";
    case "Lam": return "#"+term.name+" "+serialize(term.body);
    case "App": return "("+serialize(term.func)+" "+serialize(term.argm)+")";
    case "Let": return "$"+term.name+"="+serialize(term.expr)+";"+serialize(term.body);
    case "Eli": return "-"+serialize(term.expr);
    case "Ins": return "+"+serialize(term.expr);
    case "Chr": return "'"+term.chrx+"'";
    case "Str": return '"'+term.strx+'"';
    case "Nat": return "["+term.natx+"]";
  }
};

function is_used(name, term) {
  switch (term.ctor) {
    case "Var": return term.name === name;
    case "Ref": return false;
    case "Nul": return false;
    case "Lam": return name === term.name ? false : is_used(name, term.body);
    case "App": return is_used(name,term.func) || is_used(name,term.argm);
    case "Let": return is_used(name,term.expr) || (name === term.name ? false : is_used(name,term.body));
    case "Eli": return is_used(name,term.expr);
    case "Ins": return is_used(name,term.expr);
    case "Chr": return false;
    case "Str": return false;
    case "Nat": return false;
  }
};

// Builds a lambda by filling a template with args.
function build_from_template(arity, template, args) {
  var res = "";
  for (var i = args.length; i < arity; ++i) {
    res += ("a"+i)+"=>";
  };
  var bod = template;
  for (var i = 0; i < Math.min(args.length, arity); ++i) {
    bod = bod(js_code(args[i]));
  };
  for (var i = args.length; i < arity; ++i) {
    bod = bod("a"+i);
  };
  bod = "("+bod+")";
  for (var i = arity; i < args.length; ++i) {
    bod = bod+"("+js_code(args[i])+")";
  };
  return res + bod;
};

// Inlines a list of arguments in lambdas, as much as possible. Example:
// apply_inline((x) (y) f, [a, b, c, d, e]) = f[x<-a,y<-b](c)(d)(e)
function apply_inline(term, args) {
  if (term.ctor === "Lam" && args.length > 0) {
    return apply_inline(subst(term.body, term.name, args[0]), args.slice(1));
  } else if (args.length > 0) {
    return apply_inline(App(term, args[0]), args.slice(1));
  } else {
    return term;
  }
};

// Bind constructor fields into case lambdas. If the case is still a function
// (unsaturated elim: `c0=>c1=>...`), apply leftover fields. After at least one
// lambda is bound, extra fields are unused (`open` / `_`) and must be dropped
// so a string/record is not called as a function.
function apply_fields(term, args) {
  function go(term, args, bound) {
    if (term.ctor === "Lam" && args.length > 0) {
      return go(subst(term.body, term.name, args[0]), args.slice(1), true);
    } else if (!bound && args.length > 0) {
      return go(App(term, args[0]), args.slice(1), false);
    } else {
      return term;
    }
  }
  return go(term, args, false);
};

function application(func, name, allow_empty = false) {
  function open_ctor(ctor, expr_name, used_vars = null) {
    var ctor_vars = [];
    var ctor_open = "";
    for (var j = 0; j < ctor.length; ++j) {
      var nam = fresh();
      ctor_open += "var "+nam+"="+ctor[j](expr_name)+";"
      ctor_vars.push(Var(nam));
    };
    return {ctor_open, ctor_vars};
  };

  // Used to group cases that don't use variables together (ex: the default case).
  function get_case_group(i, arity, term) {
    var vars = [];
    for (var j = 0; j < arity; ++j) {
      if (term.ctor !== "Lam") {
        return String(i);
      }
      if (is_used(term.name, term.body)) {
        return String(i);
      }
      vars.push(term.name);
      term = term.body;
    }
    return serialize(term);
  };

  // Gets the variables used by a case
  function get_used_vars(arity, term) {
    var vars = [];
    for (var j = 0; j < arity; ++j) {
      if (term.ctor !== "Lam") {
        return null;
      }
      vars.push(is_used(term.name, term.body));
      term = term.body;
    }
    return vars;
  };

  var args = [];
  while (func && func.ctor === "App") {
    args.push(func.argm);
    func = func.func;
  };
  args.reverse();

  if (!allow_empty && args.length === 0) {
    return null;
  }

  // Primitive function application
  if (func && func.ctor === "Ref" && prim_funcs[func.name]) {
    if ((func.name === "Nat.to_u8" || func.name === "U8.from_nat") && args.length === 1 && args[0].ctor === "Nat") {
      return returner(name, String(Number(args[0].natx)));
    } else if ((func.name === "Nat.to_u16" || func.name === "U16.from_nat") && args.length === 1 && args[0].ctor === "Nat") {
      return returner(name, String(Number(args[0].natx)));
    } else if ((func.name === "Nat.to_u32" || func.name === "U32.from_nat") && args.length === 1 && args[0].ctor === "Nat") {
      return returner(name, String(Number(args[0].natx)));
    } else if ((func.name === "Nat.to_u64" || func.name === "U64.from_nat") && args.length === 1 && args[0].ctor === "Nat") {
      return returner(name, String(args[0].natx)+"n");
    } else if ((func.name === "Nat.to_u128" || func.name === "U128.from_nat") && args.length === 1 && args[0].ctor === "Nat") {
      return returner(name, String(args[0].natx)+"n");
    } else if ((func.name === "Nat.to_u256" || func.name === "U256.from_nat") && args.length === 1 && args[0].ctor === "Nat") {
      return returner(name, String(args[0].natx)+"n");
    } else if ((func.name === "Nat.to_i8" || func.name === "I8.from_nat") && args.length === 1 && args[0].ctor === "Nat") {
      return returner(name, String(args[0].natx));
    } else if ((func.name === "Nat.to_i16" || func.name === "I16.from_nat") && args.length === 1 && args[0].ctor === "Nat") {
      return returner(name, String(args[0].natx));
    } else if ((func.name === "Nat.to_i32" || func.name === "I32.from_nat") && args.length === 1 && args[0].ctor === "Nat") {
      return returner(name, String(args[0].natx));
    } else if ((func.name === "Nat.to_i64" || func.name === "I64.from_nat") && args.length === 1 && args[0].ctor === "Nat") {
      return returner(name, String(args[0].natx)+"n");
    } else if ((func.name === "Nat.to_i128" || func.name === "I128.from_nat") && args.length === 1 && args[0].ctor === "Nat") {
      return returner(name, String(args[0].natx)+"n");
    } else if ((func.name === "Nat.to_i256" || func.name === "I256.from_nat") && args.length === 1 && args[0].ctor === "Nat") {
      return returner(name, String(args[0].natx)+"n");
    } else if ( func.name === "F64.make"
            && args.length === 3
            && args[0].ctor === "Ref"
            && ( args[0].name === "Bool.true"
              || args[0].name === "Bool.false")
            && args[1].ctor === "Nat"
            && args[2].ctor === "Nat") {
      var str = String(Number(args[1].natx));
      var mag = Number(args[2].natx);
      while (str.length < mag + 1) {
        str = "0" + str;
      }
      var str = str.slice(0, -mag) + "." + str.slice(-mag);
      return returner(name, (args[0].name === "Bool.false" ? "-" : "") + str);
    } else if (( func.name === "F64.parse"
              || func.name === "F64.read"
              || func.name === "F32.parse"
              || func.name === "I8.read"
              || func.name === "I16.read"
              || func.name === "I32.read"
              || func.name === "U8.read"
              || func.name === "U16.read"
              || func.name === "U32.read")
            && args.length === 1
            && args[0].ctor === "Str") {
      var s = String(args[0].strx);
      var n = Number(s);
      return returner(name, (s !== "" && Number.isFinite(n)) ? "("+s+")" : "(0)");
    } else if (( func.name === "U64.parse"
              || func.name === "U128.read"
              || func.name === "U256.read"
              || func.name === "I64.read"
              || func.name === "I128.read"
              || func.name === "I256.read"
              || func.name === "Nat.read"
              || func.name === "Int.read")
            && args.length === 1
            && args[0].ctor === "Str") {
      var s = String(args[0].strx);
      var signed = func.name === "Int.read" || func.name === "I64.read" || func.name === "I128.read" || func.name === "I256.read";
      var ok = signed ? /^-?\d+$/.test(s) : /^\d+$/.test(s);
      return returner(name, ok ? "("+s+"n)" : "(0n)");
    } else if (func.name === "U32.for"
            && args.length === 4
            && args[3].ctor === "Lam"
            && args[3].body.ctor === "Lam") {
      var idx = js_name(args[3].name);
      var stt = js_name(args[3].body.name);
      var STT = fresh();
      var FRO = fresh();
      var TIL = fresh();
      var str = "";
      str += "(()=>{";
      //str += "let "+stt+"="+js_code(args[0])+";";
      //str += "let "+fro+"="+js_code(args[1])+";";
      //str += "let "+til+"="+js_code(args[2])+";";
      str += js_code(args[0], STT);
      str += js_code(args[1], FRO);
      str += js_code(args[2], TIL);
      str += "let "+stt+"="+STT+";";
      str += "for (let "+idx+"="+FRO+";"+idx+"<"+TIL+";++"+idx+") {";
      str += js_code(args[3].body.body, STT);
      str += stt+"="+STT+";";
      str += "};";
      str += "return "+stt+";";
      str += "})()";
      return returner(name, str);
    } else if (func.name === "I32.for"
            && args.length === 4
            && args[3].ctor === "Lam"
            && args[3].body.ctor === "Lam") {
      var idx = js_name(args[3].name);
      var stt = js_name(args[3].body.name);
      var STT = fresh();
      var FRO = fresh();
      var TIL = fresh();
      var str = "";
      str += "(()=>{";
      //str += "let "+stt+"="+js_code(args[0])+";";
      //str += "let "+fro+"="+js_code(args[1])+";";
      //str += "let "+til+"="+js_code(args[2])+";";
      str += js_code(args[0], STT);
      str += js_code(args[1], FRO);
      str += js_code(args[2], TIL);
      str += "let "+stt+"="+STT+";";
      str += "for (let "+idx+"="+FRO+";"+idx+"<"+TIL+";++"+idx+") {";
      str += js_code(args[3].body.body, STT);
      str += stt+"="+STT+";";
      str += "};";
      str += "return "+stt+";";
      str += "})()";
      return returner(name, str);
    } else if (func.name === "List.for"
          && args.length === 3
          && args[2].ctor === "Lam"
          && args[2].body.ctor === "Lam") {
      var val = js_name(args[2].name);
      var stt = js_name(args[2].body.name);
      var VAL = fresh();
      var STT = fresh();
      var LST = fresh();
      var str = "";
      str += "(()=>{";
      str += js_code(args[1], STT);
      str += js_code(args[0], LST);
      str += "let "+stt+"="+STT+";";
      str += "let "+val+";";
      str += "while ("+LST+"._==='List.cons') {";
      str += val+"="+LST+".head;";
      str += js_code(args[2].body.body, STT);
      str += stt+"="+STT+";";
      str += LST+"="+LST+".tail;";
      str += "}";
      str += "return "+stt+";";
      str += "})()";
      return returner(name, str);
    } else {
      var [arity, template] = prim_funcs[func.name];
      return returner(name, build_from_template(arity, template, args));
    }

  // Primitive type elimination
  } else if (func && func.ctor === "Eli") {
    if (typeof func.prim === "string" && prim_types[func.prim]) {
      var type_info = prim_types[func.prim];
    } else if (typeof func.prim === "object") {
      var type_info = adt_type(func.prim);
    } else {
      return null;
    };
    var {ctag, ctor} = type_info.elim;
    var nams = type_info.cnam.nams;
    var mode = type_info.cnam.mode;
    var isfn = args.length < ctor.length || !name;
    var res = "";
    if (isfn) {
      res += "(()=>";
      for (var i = args.length; i < ctor.length; ++i) {
        res += ("c"+i)+"=>";
      };
      res += "{";
    };
    res += js_code(func.expr,"self");
    switch (mode) {
      case "switch":
        var case_groups = {};
        for (var i = 0; i < nams.length; ++i) {
          var group_id = get_case_group(i, ctor[i].length, args[i] || Var("c"+i));
          case_groups[group_id] = case_groups[group_id] || [];
          case_groups[group_id].push(i)
        };
        res += "switch("+ctag("self")+"){";
        for (var group_id in case_groups) {
          for (var i of case_groups[group_id]) {
            res += "case '"+nams[i]+"':";
          }
          var i = case_groups[group_id][0];
          var used_vars = get_used_vars(ctor[i].length, args[i] || Var("c"+i));
          var {ctor_open, ctor_vars} = open_ctor(ctor[i], "self", used_vars);  
          res += ctor_open;
          var retn = fresh();
          var jsco = js_code(apply_fields(args[i] || Var("c"+i), ctor_vars), retn);
          res += jsco;
          res += isfn ? "return "+retn+";" : "var "+js_name(name)+" = "+retn+";";
          res += isfn ? "" : "break;";
        };
        res += "};";
        break;
      case "if":
        res += "if ("+ctag("self")+") {";
        var {ctor_open, ctor_vars} = open_ctor(ctor[0], "self");
        res += ctor_open;
        var retn = fresh();
        res += js_code(apply_fields(args[0] || Var("c0"), ctor_vars),retn);
        res += isfn ? "return "+retn+";" : "var "+js_name(name)+" = "+retn+";";
        res += "} else {";
        var {ctor_open, ctor_vars} = open_ctor(ctor[1], "self");
        res += ctor_open;
        var retn = fresh();
        res += js_code(apply_fields(args[1] || Var("c1"), ctor_vars),retn);
        res += isfn ? "return "+retn+";" : "var "+js_name(name)+" = "+retn+";";
        res += "};";
        break;
    }
    if (isfn) {
      res += "})()";
      for (var i = ctor.length; i < args.length; ++i) {
        res += "("+js_code(args[i])+")";
      };
      return returner(name, res);
    } else {
      if (ctor.length < args.length) {
        res += "var "+js_name(name)+" = "+js_name(name);
        for (var i = ctor.length; i < args.length; ++i) {
          res += "("+js_code(args[i])+")";
        };
        res += ";";
      };
      return res;
    }

  // Saturated function application (optimization that bypasses currying)
  } else if (func && func.ctor === "Ref" && ARITY_OF[func.name] === args.length) {
    return returner(name, js_code(func)+"$("+args.map(x => js_code(x)).join(",")+")");
  }

  return null;
};

function instantiation(term) {
  if (term.ctor === "Ins") {
    if (typeof term.prim === "string" && prim_types[term.prim]) {
      var templates = prim_types[term.prim].inst;
    } else if (typeof term.prim === "object") {
      var templates = adt_type(term.prim).inst;
    } else {
      return null;
    }
    term = term.expr;
    var vars = [];
    while (term.ctor === "Lam") {
      vars.push(term.name);
      term = term.body;
    }
    if (templates.length === vars.length) {
      var func = term;
      var args = [];
      while (func.ctor === "App") { 
        args.push(func.argm);
        func = func.func;
      };
      args.reverse();
      if (func.ctor === "Var" || func.ctor === "Ref") {
        for (var i = 0; i < vars.length; ++i) {
          if (func.name === vars[i]) {
            var [ctor_arity, ctor_template] = templates[i];
            if (ctor_arity === args.length) {
              var res = ctor_template;
              for (var arg of args) {
                res = res(js_code(arg));
              };
              return res;
            };
          }
        };
      };
    };
  };
  return null;
};

function instantiator(inst) {
  var ctors = inst;
  var res = "x=>x";
  for (var i = 0; i < ctors.length; ++i) {
    res += "(";
    var [ctor_arity, ctor_template] = ctors[i];
    for (var j = 0; j < ctor_arity; ++j) {
      res += "x"+j+"=>";
    };
    var bod = ctor_template;
    for (var j = 0; j < ctor_arity; ++j) {
      bod = bod("x"+j);
    };
    res += bod+")";
  };
  return res;
};

//tojs (let x = 1; let y = 2; let z = 3; add(x,y,z))

//function flatten_lets(term) {
  //var res = "(()=>{";
  //while (term.ctor === "Let") {
    //res += "var "+js_name(term.name)+"="+js_code(term.expr)+";";
    //term = term.body;
  //};
  //res += "return "+js_code(term)+"})()";
  //return res;
//};

// Checks if a function is recursive and tail-safe.
function recursion(term, name) {
  // Used by tail-call detection. If this application is the elimination of a
  // native type, then its arguments are all in tail position.
  function get_branches(term) {
    var done = false;
    var func = term;
    var args = [];
    while (func.ctor === "App") {
      args.push(func.argm);
      func = func.func;
    };
    args.reverse();
    if (func.ctor === "Eli") {
      //if (DEBUG) console.log("- Possibly branch safe.", name, func.prim);
      if (typeof func.prim === "string" && prim_types[func.prim]) {
        var type_info = prim_types[func.prim];
      } else if (typeof func.prim === "object") {
        var type_info = adt_type(func.prim);
      } else {
        return null;
      }
      if (args.length === type_info.inst.length) {
        //if (DEBUG) console.log("- Correct case count.");
        var branches = [];
        for (var i = 0; i < args.length; ++i) {
          var fields = type_info.inst[i][0];
          var branch = args[i];
          //if (DEBUG) console.log("...", i, fields, type_info.inst[i], stringify(branch));
          var arity = 0;
          while (arity < fields && branch.ctor === "Lam") {
            arity += 1;
            branch = branch.body;
          }
          if (arity === fields) {
            //if (DEBUG) console.log("- Correct field count on branch "+i+".");
            branches.push(branch);
          }
        }
        if (args.length === branches.length) {
          return {func, branches};
        }
      }
    }
    return null;
  };
  var args = [];
  while (term.ctor === "Lam") {
    args.push(term.name);
    term = term.body;
  };
  var is_recursive = false;
  var is_tail_safe = true;
  function check(term, tail, arit = 0) {
    //if (DEBUG) console.log("check", tail, stringify(term));
    switch (term.ctor) {
      case "Lam":
        check(term.body, false, 0);
        break;
      case "App":
        var got = tail && get_branches(term);
        if (got) {
          //if (DEBUG) console.log("- Has branches...", got.branches.length, args.length);
          check(got.func, tail && got.branches.length === args.length, arit + 1);
          //if (DEBUG) console.log("~f "+stringify(got.func));
          for (var branch of got.branches) {
            //if (DEBUG) console.log("~b "+stringify(branch));
            check(branch, tail, 0);
          };
        } else {
          check(term.func, tail, arit + 1);
          check(term.argm, false, 0);
        };
        break;
      case "Let":
        check(term.expr, false, 0);
        check(term.body, tail, arit);
        break;
      case "Eli":
        check(term.expr, tail, arit);
        break;
      case "Ins":
        check(term.expr, tail, arit);
        break;
      case "Ref":
        if (term.name === name) {
          is_recursive = true;
          is_tail_safe = is_tail_safe && tail && ARITY_OF[name] === arit;
          //if (DEBUG) console.log("- Recurses:", term.name, name, is_recursive, is_tail_safe, ARITY_OF[name]+"=="+arit)
        };
        break;
    };
  };
  check(term, true);
  if (is_recursive) {
    return {tail: is_tail_safe, args};
  }
  return null;
};

function print_str(str) {
  var out = ""
  for (var i = 0; i < str.length; i++) {
    if (str[i] == '\\' || str[i] == '"' | str[i] == "'") {
      out += '\\' + str[i];
    } else if (str[i] >= ' ' && str[i] <= `~`) {
      out += str[i];
    } else {
      out += "\\u{" + str.codePointAt(i).toString(16) + "}";
    }
  }
  return out;
}

// Returns either an expression or a local assignment
function returner(name, expr) {
  if (name) {
    return "var "+js_name(name)+" = "+expr+";";
  } else {
    return expr;
  }
};

function js_code(term, name, top_name = null) {
  var app = application(term, name);
  var ins = instantiation(term);
  if (top_name && term.ctor === "Lam") {
    var rec = recursion(term, top_name);
    if (rec && (rec.tail || top_name.slice(-5) === ".__loop__")) {
      var vars = [];
      var expr = "function "+js_name(top_name)+"$(";
      var init = true;
      while (term.ctor === "Lam") {
        vars.push(term.name);
        expr = expr + (init?"":",") + js_name(term.name);
        term = term.body;
        init = false;
      }
      expr += "){";
      expr += "var "+js_name(top_name)+"$=("+vars.map(js_name).join(",")+")=>({ctr:'TCO',arg:["+vars.map(js_name).join(",")+"]});";
      expr += "var "+js_name(top_name)+"="+vars.map(v => js_name(v)+"=>").join("")+js_name(top_name)+"$("+vars.map(js_name).join(",")+");";
      expr += "var arg=["+vars.map(js_name).join(",")+"];";
      expr += "while(true){";
      expr += "let ["+vars.map(js_name).join(",")+"]=arg;";
      expr += "var R="+js_code(term)+";";
      expr += "if(R.ctr==='TCO')arg=R.arg;";
      expr += "else return R;";
      expr += "}}";
      return returner(name, expr);
    } else {
      var expr = "function "+js_name(top_name)+"$(";
      var init = true;
      while (term.ctor === "Lam") {
        expr += (init?"":",") + js_name(term.name);
        term = term.body;
        init = false;
      }
      var retn = fresh();
      expr += "){";
      expr += js_code(term, retn);
      expr += "return "+retn+";";
      expr += "}";
      return returner(name, expr);
    }
  } else if (app) {
    return app;
  } else if (ins) {
    return returner(name, ins);
  } else if (typeof term === "string") {
    return returner(name, term);
  } else {
    switch (term.ctor) {
      case "Var":
        return returner(name, js_name(term.name));
      case "Ref":
        return returner(name, js_name(term.name));
      case "Nul":
        return returner(name, "null");
      case "Lam":
        var expr = "(";
        while (term.ctor === "Lam") {
          expr += js_name(term.name) + "=>";
          term = term.body;
        }
        var retn = fresh();
        expr += "{";
        expr += js_code(term, retn);
        expr += "return "+retn+";";
        expr += "})";
        return returner(name, expr);
      case "App":
        return returner(name, js_code(term.func)+"("+js_code(term.argm)+")");
      case "Let":
        if (name) {
          return js_code(term.expr, term.name)
               + js_code(term.body, name);
        } else {
          var expr = "(()=>{";
          var retn = fresh();
          expr += js_code(term, retn);
          expr += "return "+retn+";";
          expr += "})()";
          return expr;
        }
      case "Eli":
        if (typeof term.prim === "string") {
          return returner(name, "elim_"+term.prim.toLowerCase()+"("+js_code(term.expr)+")");
        } else {
          return returner(name, "null");
        }
      case "Ins":
        if (typeof term.prim === "string") {
          return returner(name, "inst_"+term.prim.toLowerCase()+"("+js_code(term.expr)+")");
        } else {
          return returner(name, "null");
        }
      case "Nat":
        return returner(name, term.natx+"n");
      case "Chr":
        return returner(name, term.chrx.codePointAt(0));
      case "Str":
        return returner(name, '"'+print_str(term.strx)+'"');
    };
  };
};

function js_name(str) {
  switch (str) {
    case "true": return "$true";
    case "false": return "$false";
    default: return str.replace(/\./g,"$");
  }
};

// TODO: pass this around instead of making a global object (: I'm tired, ok?
var ARITY_OF = {};
function compile_defs(defs, main, opts) {
  opts = opts || {};

  //console.log("compiling ", main);
  var {defs: cmps, nams} = core_to_comp(defs, main);
  var prim_use = collect_prim_use(defs, nams);

  var used_prim_types = {}; 
  for (var prim in prim_types) {
    if (prim_use.types[prim] && defs[prim]) used_prim_types[prim] = prim_types[prim];
  };
  var used_prim_funcs = {};
  for (var prim in prim_funcs) {
    if (prim_use.funcs[prim] && defs[prim]) used_prim_funcs[prim] = prim_funcs[prim];
  };

  // Builds header and initial dependencies
  var isio = fmc.equal(defs[main].type, fmc.App(fmc.Ref("IO"), fmc.Ref("Unit")), defs);
  var hneed = isio ? collect_host_need(defs, nams) : null;
  var code = "";

  if (!opts.expression) {
    code += "module.exports = ";
  };
  code += "(function (){\n";

  if (used_prim_types["Int"]) {
    code += [
      "  function int_pos(i) {",
      "    return i >= 0n ? i : 0n;",
      "  };",
      "  function int_neg(i) {",
      "    return i < 0n ? -i : 0n;",
      "  };",
      ].join("\n")+"\n";
  }

  if (used_prim_types["U8"]) {
    code += [
      "  function word_to_u8(w) {",
      "    var u = 0;",
      "    for (var i = 0; i < 8; ++i) {",
      "      u = u | (w._ === 'Word.i' ? 1 << i : 0);",
      "      w = w.pred;",
      "    };",
      "    return u;",
      "  };",
      "  function u8_to_word(u) {",
      "    var w = {_: 'Word.e'};",
      "    for (var i = 0; i < 8; ++i) {",
      "      w = {_: (u >>> (8-i-1)) & 1 ? 'Word.i' : 'Word.o', pred: w};",
      "    };",
      "    return w;",
      "  };",
      ].join("\n")+"\n";
  }

  if (used_prim_types["U16"]) {
    code += [
      "  function word_to_u16(w) {",
      "    var u = 0;",
      "    for (var i = 0; i < 16; ++i) {",
      "      u = u | (w._ === 'Word.i' ? 1 << i : 0);",
      "      w = w.pred;",
      "    };",
      "    return u;",
      "  };",
      "  function u16_to_word(u) {",
      "    var w = {_: 'Word.e'};",
      "    for (var i = 0; i < 16; ++i) {",
      "      w = {_: (u >>> (16-i-1)) & 1 ? 'Word.i' : 'Word.o', pred: w};",
      "    };",
      "    return w;",
      "  };",
      "  function u16_to_bits(x) {",
      "    var s = '';",
      "    for (var i = 0; i < 16; ++i) {",
      "      s = (x & 1 ? '1' : '0') + s;",
      "      x = x >>> 1;",
      "    }",
      "    return s;",
      "  };",
      ].join("\n")+"\n";
  }

  if (used_prim_types["U32"]) {
    code += [
      "  function word_to_u32(w) {",
      "    var u = 0;",
      "    for (var i = 0; i < 32; ++i) {",
      "      u = u | (w._ === 'Word.i' ? 1 << i : 0);",
      "      w = w.pred;",
      "    };",
      "    return u;",
      "  };",
      "  function u32_to_word(u) {",
      "    var w = {_: 'Word.e'};",
      "    for (var i = 0; i < 32; ++i) {",
      "      w = {_: (u >>> (32-i-1)) & 1 ? 'Word.i' : 'Word.o', pred: w};",
      "    };",
      "    return w;",
      "  };",
      "  function u32_for(state, from, til, func) {",
      "    for (var i = from; i < til; ++i) {",
      "      state = func(i)(state);",
      "    }",
      "    return state;",
      "  };"
      ].join("\n")+"\n";
  };

  if (used_prim_types["I32"]) {
    code += [
      "  function word_to_i32(w) {",
      "    var u = 0;",
      "    for (var i = 0; i < 32; ++i) {",
      "      u = u | (w._ === 'Word.i' ? 1 << i : 0);",
      "      w = w.pred;",
      "    };",
      "    return u;",
      "  };",
      "  function i32_to_word(u) {",
      "    var w = {_: 'Word.e'};",
      "    for (var i = 0; i < 32; ++i) {",
      "      w = {_: (u >> (32-i-1)) & 1 ? 'Word.i' : 'Word.o', pred: w};",
      "    };",
      "    return w;",
      "  };",
      "  function i32_for(state, from, til, func) {",
      "    for (var i = from; i < til; ++i) {",
      "      state = func(i)(state);",
      "    }",
      "    return state;",
      "  };"
      ].join("\n")+"\n";
  };

  if (used_prim_types["U64"]) {
    code += [
      "  function word_to_u64(w) {",
      "    var u = 0n;",
      "    for (var i = 0n; i < 64n; i += 1n) {",
      "      u = u | (w._ === 'Word.i' ? 1n << i : 0n);",
      "      w = w.pred;",
      "    };",
      "    return u;",
      "  };",
      "  function u64_to_word(u) {",
      "    var w = {_: 'Word.e'};",
      "    for (var i = 0n; i < 64n; i += 1n) {",
      "      w = {_: (u >> (64n-i-1n)) & 1n ? 'Word.i' : 'Word.o', pred: w};",
      "    };",
      "    return w;",
      "  };",
      ].join("\n")+"\n";
  };

  if (used_prim_types["U128"]) {
    code += [
      "  function word_to_u128(w) {",
      "    var u = 0n;",
      "    for (var i = 0n; i < 128n; i += 1n) {",
      "      u = u | (w._ === 'Word.i' ? 1n << i : 0n);",
      "      w = w.pred;",
      "    };",
      "    return u;",
      "  };",
      "  function u128_to_word(u) {",
      "    var w = {_: 'Word.e'};",
      "    for (var i = 0n; i < 128n; i += 1n) {",
      "      w = {_: (u >> (128n-i-1n)) & 1n ? 'Word.i' : 'Word.o', pred: w};",
      "    };",
      "    return w;",
      "  };",
      ].join("\n")+"\n";
  };

  if (used_prim_types["U256"]) {
    code += [
      "  function word_to_u256(w) {",
      "    var u = 0n;",
      "    for (var i = 0n; i < 256n; i += 1n) {",
      "      u = u | (w._ === 'Word.i' ? 1n << i : 0n);",
      "      w = w.pred;",
      "    };",
      "    return u;",
      "  };",
      "  function u256_to_word(u) {",
      "    var w = {_: 'Word.e'};",
      "    for (var i = 0n; i < 256n; i += 1n) {",
      "      w = {_: (u >> (256n-i-1n)) & 1n ? 'Word.i' : 'Word.o', pred: w};",
      "    };",
      "    return w;",
      "  };",
      ].join("\n")+"\n";
  };

  if (used_prim_types["F64"]) {
    code += [
      "  var f64 = new Float64Array(1);",
      "  var u32 = new Uint32Array(f64.buffer);",
      "  function f64_get_bit(x, i) {",
      "    f64[0] = x;",
      "    if (i < 32) {",
      "      return (u32[0] >>> i) & 1;",
      "    } else {",
      "      return (u32[1] >>> (i - 32)) & 1;",
      "    }",
      "  };",
      "  function f64_set_bit(x, i) {",
      "    f64[0] = x;",
      "    if (i < 32) {",
      "      u32[0] = u32[0] | (1 << i);",
      "    } else {",
      "      u32[1] = u32[1] | (1 << (i - 32));",
      "    }",
      "    return f64[0];",
      "  };",
      "  function word_to_f64(w) {",
      "    var x = 0;",
      "    for (var i = 0; i < 64; ++i) {",
      "      x = w._ === 'Word.i' ? f64_set_bit(x,i) : x;",
      "      w = w.pred;",
      "    };",
      "    return x;",
      "  };",
      "  function f64_to_word(x) {",
      "    var w = {_: 'Word.e'};",
      "    for (var i = 0; i < 64; ++i) {",
      "      w = {_: f64_get_bit(x,64-i-1) ? 'Word.i' : 'Word.o', pred: w};",
      "    };",
      "    return w;",
      "  };",
      "  function f64_make(s, a, b) {",
      "    return (s ? 1 : -1) * Number(a) / 10 ** Number(b);",
      "  };",
      "  function word_bits_to_uint(w) {",
      "    var n = 0, p = 1;",
      "    while (w && w._ !== 'Word.e') {",
      "      if (w._ === 'Word.i') n += p;",
      "      p *= 2;",
      "      w = w.pred;",
      "    };",
      "    return n;",
      "  };",
      "  function word_bits_to_sint(w) {",
      "    var n = 0, p = 1, sz = 0, t = w;",
      "    while (t && t._ !== 'Word.e') {",
      "      if (t._ === 'Word.i') n += p;",
      "      p *= 2;",
      "      sz += 1;",
      "      t = t.pred;",
      "    };",
      "    if (sz <= 0) return 0;",
      "    var half = 2 ** (sz - 1);",
      "    var bound = 2 ** sz;",
      "    return n < half ? n : -(bound - n);",
      "  };",
      ].join("\n")+"\n";
  };

  if (used_prim_types["F32"]) {
    code += [
      "  var f32 = new Float32Array(1);",
      "  var u32f = new Uint32Array(f32.buffer);",
      "  function f32_get_bit(x, i) {",
      "    f32[0] = x;",
      "    return (u32f[0] >>> i) & 1;",
      "  };",
      "  function f32_set_bit(x, i) {",
      "    f32[0] = x;",
      "    u32f[0] = u32f[0] | (1 << i);",
      "    return f32[0];",
      "  };",
      "  function word_to_f32(w) {",
      "    var x = 0;",
      "    for (var i = 0; i < 32; ++i) {",
      "      x = w && w._ === 'Word.i' ? f32_set_bit(x,i) : x;",
      "      w = w && w.pred;",
      "    };",
      "    return x;",
      "  };",
      "  function f32_to_word(x) {",
      "    var w = {_: 'Word.e'};",
      "    for (var i = 0; i < 32; ++i) {",
      "      w = {_: f32_get_bit(x,32-i-1) ? 'Word.i' : 'Word.o', pred: w};",
      "    };",
      "    return w;",
      "  };",
      ].join("\n")+"\n";
  };

  if (used_prim_types["Buffer8"]) {
    code += [
      "  function u8array_to_buffer8(a) {",
      "    function go(a, buffer) {",
      "      switch (a._) {",
      "        case 'Array.tip': buffer.push(a.value); break;",
      "        case 'Array.tie': go(a.lft, buffer); go(a.rgt, buffer); break;",
      "      }",
      "      return buffer;",
      "    };",
      "    return new Uint8Array(go(a, []));",
      "  };",
      "  function buffer8_to_u8array(b) {",
      "    function go(b) {",
      "      if (b.length === 1) {",
      "        return {_: 'Array.tip', value: b[0]};",
      "      } else {",
      "        var lft = go(b.slice(0,b.length/2));",
      "        var rgt = go(b.slice(b.length/2));",
      "        return {_: 'Array.tie', lft, rgt};",
      "      };",
      "    };",
      "    return go(b);",
      "  };",
      "  function buffer8_to_depth(b) {",
      "    return BigInt(Math.log(b.length) / Math.log(2));",
      "  };",
      ].join("\n")+"\n";
  };

  if (used_prim_types["Buffer32"]) {
    code += [
      "  function u32array_to_buffer32(a) {",
      "    function go(a, buffer) {",
      "      switch (a._) {",
      "        case 'Array.tip': buffer.push(a.value); break;",
      "        case 'Array.tie': go(a.lft, buffer); go(a.rgt, buffer); break;",
      "      }",
      "      return buffer;",
      "    };",
      "    return new Uint32Array(go(a, []));",
      "  };",
      "  function buffer32_to_u32array(b) {",
      "    function go(b) {",
      "      if (b.length === 1) {",
      "        return {_: 'Array.tip', value: b[0]};",
      "      } else {",
      "        var lft = go(b.slice(0,b.length/2));",
      "        var rgt = go(b.slice(b.length/2));",
      "        return {_: 'Array.tie', lft, rgt};",
      "      };",
      "    };",
      "    return go(b);",
      "  };",
      "  function buffer32_to_depth(b) {",
      "    return BigInt(Math.log(b.length) / Math.log(2));",
      "  };",
      ].join("\n")+"\n";
  };

  if ( used_prim_funcs["BitsMap.set"]
    || used_prim_funcs["BitsMap.get"]
    || used_prim_funcs["BitsMap.del"]
    || used_prim_funcs["BitsMap.ini"]) {
    code += [
      "  var bitsmap_new = {_: 'BitsMap.new'};",
      "  var bitsmap_tie = function(val, lft, rgt) {",
      "    return {_: 'BitsMap.tip', val, lft, rgt};",
      "  }",
      "  var maybe_none = {_: 'Maybe.none'};",
      "  var maybe_some = function(value) {",
      "    return {_: 'Maybe.some', value};",
      "  }",
      "  var bitsmap_get = function(bits, map) {",
      "    for (var i = bits.length - 1; i >= 0; --i) {",
      "      if (map._ !== 'BitsMap.new') {",
      "        map = bits[i] === '0' ? map.lft : map.rgt;",
      "      }",
      "    }",
      "    return map._ === 'BitsMap.new' ? maybe_none : map.val;",
      "  }",
      "  var bitsmap_set = function(bits, val, map, mode) {",
      "    var res = {value: map};",
      "    var key = 'value';",
      "    var obj = res;",
      "    for (var i = bits.length - 1; i >= 0; --i) {",
      "      var map = obj[key];",
      "      if (map._ === 'BitsMap.new') {",
      "        obj[key] = {_: 'BitsMap.tie', val: maybe_none, lft: bitsmap_new, rgt: bitsmap_new};",
      "      } else {",
      "        obj[key] = {_: 'BitsMap.tie', val: map.val, lft: map.lft, rgt: map.rgt};",
      "      }",
      "      obj = obj[key];",
      "      key = bits[i] === '0' ? 'lft' : 'rgt';",
      "    }",
      "    var map = obj[key];",
      "    if (map._ === 'BitsMap.new') {",
      "      var x = mode === 'del' ? maybe_none : {_: 'Maybe.some', value: val};",
      "      obj[key] = {_: 'BitsMap.tie', val: x, lft: bitsmap_new, rgt: bitsmap_new};",
      "    } else {",
      "      var x = mode === 'set' ? {_: 'Maybe.some', value: val} : mode === 'del' ? maybe_none : map.val;",
      "      obj[key] = {_: 'BitsMap.tie', val: x, lft: map.lft, rgt: map.rgt};",
      "    }",
      "    return res.value;",
      "  };",
    ].join("\n")+"\n";
  }

  if (used_prim_funcs["List.for"]) {
    code += [
      "  var list_for = list => nil => cons => {",
      "    while (list._ !== 'List.nil') {",
      "      nil = cons(list.head)(nil);",
      "      list = list.tail;",
      "    }",
      "    return nil;",
      "  };",
    ].join("\n")+"\n";
  }

  if (used_prim_funcs["List.length"]) {
    code += [
      "  var list_length = list => {",
      "    var len = 0;",
      "    while (list._ === 'List.cons') {",
      "      len += 1;",
      "      list = list.tail;",
      "    };",
      "    return BigInt(len);",
      "  };",
    ].join("\n")+"\n";
  }

  if (used_prim_funcs["Nat.to_bits"]) {
    code += [
      "var nat_to_bits = n => {",
      "  return n === 0n ? '' : n.toString(2);",
      "};",
    ].join("\n");
  }

  if (used_prim_funcs["Fm.Name.to_bits"]) {
    code += [
      "var fm_name_to_bits = name => {",
      "  const TABLE = {",
      "    'A': '000000', 'B': '100000', 'C': '010000', 'D': '110000',",
      "    'E': '001000', 'F': '101000', 'G': '011000', 'H': '111000',",
      "    'I': '000100', 'J': '100100', 'K': '010100', 'L': '110100',",
      "    'M': '001100', 'N': '101100', 'O': '011100', 'P': '111100',",
      "    'Q': '000010', 'R': '100010', 'S': '010010', 'T': '110010',",
      "    'U': '001010', 'V': '101010', 'W': '011010', 'X': '111010',",
      "    'Y': '000110', 'Z': '100110', 'a': '010110', 'b': '110110',",
      "    'c': '001110', 'd': '101110', 'e': '011110', 'f': '111110',",
      "    'g': '000001', 'h': '100001', 'i': '010001', 'j': '110001',",
      "    'k': '001001', 'l': '101001', 'm': '011001', 'n': '111001',",
      "    'o': '000101', 'p': '100101', 'q': '010101', 'r': '110101',",
      "    's': '001101', 't': '101101', 'u': '011101', 'v': '111101',",
      "    'w': '000011', 'x': '100011', 'y': '010011', 'z': '110011',",
      "    '0': '001011', '1': '101011', '2': '011011', '3': '111011',",
      "    '4': '000111', '5': '100111', '6': '010111', '7': '110111',",
      "    '8': '001111', '9': '101111', '.': '011111', '_': '111111',",
      "  }",
      "  var a = '';",
      "  for (var i = name.length - 1; i >= 0; --i) {",
      "    a += TABLE[name[i]];",
      "  }",
      "  return a;",
      "};",
    ].join("\n");
  };

  if (used_prim_funcs["Kind.Name.to_bits"] || used_prim_funcs["Sure.Name.to_bits"]) {
    code += [
      "var kind_name_to_bits = name => {",
      "  const TABLE = {",
      "    'A': '000000', 'B': '100000', 'C': '010000', 'D': '110000',",
      "    'E': '001000', 'F': '101000', 'G': '011000', 'H': '111000',",
      "    'I': '000100', 'J': '100100', 'K': '010100', 'L': '110100',",
      "    'M': '001100', 'N': '101100', 'O': '011100', 'P': '111100',",
      "    'Q': '000010', 'R': '100010', 'S': '010010', 'T': '110010',",
      "    'U': '001010', 'V': '101010', 'W': '011010', 'X': '111010',",
      "    'Y': '000110', 'Z': '100110', 'a': '010110', 'b': '110110',",
      "    'c': '001110', 'd': '101110', 'e': '011110', 'f': '111110',",
      "    'g': '000001', 'h': '100001', 'i': '010001', 'j': '110001',",
      "    'k': '001001', 'l': '101001', 'm': '011001', 'n': '111001',",
      "    'o': '000101', 'p': '100101', 'q': '010101', 'r': '110101',",
      "    's': '001101', 't': '101101', 'u': '011101', 'v': '111101',",
      "    'w': '000011', 'x': '100011', 'y': '010011', 'z': '110011',",
      "    '0': '001011', '1': '101011', '2': '011011', '3': '111011',",
      "    '4': '000111', '5': '100111', '6': '010111', '7': '110111',",
      "    '8': '001111', '9': '101111', '.': '011111', '_': '111111',",
      "  }",
      "  var a = '';",
      "  for (var i = name.length - 1; i >= 0; --i) {",
      "    a += TABLE[name[i]];",
      "  }",
      "  return a;",
      "};",
    ].join("\n");
  };

  for (var prim in used_prim_types) {
    code += "  const inst_"+prim.toLowerCase()+" = "+instantiator(used_prim_types[prim].inst)+";\n";
    code += "  const elim_"+prim.toLowerCase()+" = "+js_code(Lam("x", application(Eli(prim, Var("x")), null, true)))+";\n";
  };

  if (isio) {
    code += "  var run = (p) => {\n";
    code += "    if (typeof window === 'undefined') {";
    code += "      var rl = eval(\"require('readline')\").createInterface({input:process.stdin,output:process.stdout,terminal:false});\n";
    code += "      var fs = eval(\"require('fs')\");\n";
    code += "      var pc = eval(\"process\");\n";
    code += "      var ht = eval(\"require('http')\");\n";
    code += "      var hs = eval(\"require('https')\");\n";
    code += "      var dg = eval(\"require('dgram')\");\n";
    code += "    } else {\n";
    code += "      var rl = {question: (x,f) => f(''), close: () => {}};\n";
    code += "      var fs = {readFileSync: () => ''};\n";
    code += "      var pc = {exit: () => {}, argv: []};\n";
    code += "      var ht = null;\n";
    code += "      var hs = null;\n";
    code += "      var dg = null;\n";
    code += "    };\n";
    code += "    var lib = {rl,fs,pc,ht,hs,dg};\n";
    code += "    return run_io(lib,p)\n";
    code += "      .then((x) => { host_release_all(lib); rl.close(); return x; })\n";
    code += "      .catch((e) => { host_release_all(lib); rl.close(); try { var msg = String(e && (e.stack || e.message) || e); if (typeof console !== 'undefined') console.error(msg); } catch (e2) {} try { lib.pc.exit(1); } catch (e3) {} throw e; });\n";
    code += "  };\n";
    if (hneed.file) {
    code += "  var set_file = (lib, param) => {\n";
    code += "    var path = '';\n"
    code += "    for (var i = 0; i < param.length && param[i] !== '='; ++i) {\n";
    code += "      path += param[i];\n";
    code += "    };\n";
    code += "    var data = param.slice(i+1);\n";
    code += "    lib.fs.mkdirSync(path.split('/').slice(0,-1).join('/'),{recursive:true});\n";
    code += "    lib.fs.writeFileSync(path,data);\n";
    code += "    return host_ok('');\n";
    code += "  };\n";
    code += "  var del_file = (lib, param) => {\n";
    code += "    try {\n"; 
    code += "      lib.fs.unlinkSync(param);\n";
    code += "      return host_ok('');\n";
    code += "    } catch (e) {\n";
    code += "      if (e.message.indexOf('EPERM') !== -1) {\n";
    code += "        lib.fs.rmdirSync(param);\n";
    code += "        return host_ok('');\n";
    code += "      } else {\n";
    code += "        return host_err(String(e && e.message || e));\n";
    code += "      }\n";
    code += "    }\n";
    code += "  };\n";
    code += "  var get_file = (lib, param) => {\n";
    code += "    var p = String(param || '').replace(/\\\\/g, '/');\n";
    code += "    if (typeof process !== 'undefined' && process.env && process.env.SURE_CACHE === '0') {\n";
    code += "      if (p === '.cache' || p.indexOf('.cache/') === 0 || p.indexOf('/.cache/') >= 0) return host_ok('');\n";
    code += "    }\n";
    code += "    return host_ok(lib.fs.readFileSync(param, 'utf8'));\n";
    code += "  }\n";
    code += "  var get_dir = (lib, param) => {\n";
    code += "    return host_ok(lib.fs.readdirSync(param).join(';'));\n";
    code += "  };\n";
    code += "  var get_file_mtime = (lib, param) => {\n";
    code += "    return host_ok(String(lib.fs.statSync(param).mtime.getTime()));\n";
    code += "  };\n";
    }
    code += "  var HOST_STATE = {};\n";
    code += "  var HOST_RES = []; var HOST_FD = {}; var HOST_FD_N = 0; var HOST_STREAM = {}; var HOST_STREAM_N = 0;\n";
    code += "  var host_ok = function(s) { return '0\\n' + String(s == null ? '' : s); };\n";
    code += "  var host_err = function(s) { return '1\\n' + String(s == null ? '' : s); };\n";
    code += HOST_ABORT_SRC;
    code += "  var host_release_all = (lib) => {\n";
    code += "    while (HOST_RES.length) {\n";
    code += "      var r = HOST_RES.pop();\n";
    code += "      try {\n";
    code += "        if (r.kind === 'temp' && r.path && lib && lib.fs) lib.fs.unlinkSync(r.path);\n";
    code += "        if (r.kind === 'fd' && r.id && HOST_FD[r.id]) { HOST_FD[r.id].fd.close(); delete HOST_FD[r.id]; }\n";
    code += "        if (r.kind === 'stream' && r.id && HOST_STREAM[r.id]) { HOST_STREAM[r.id].fd.close(); delete HOST_STREAM[r.id]; }\n";
    code += "        if (r.kind === 'ws' && r.id && typeof HOST_TCP !== 'undefined' && HOST_TCP[r.id]) {\n";
    code += "          try { HOST_TCP[r.id].sock.end(); } catch (eW) {}\n";
    code += "          delete HOST_TCP[r.id];\n";
    code += "        }\n";
    code += "      } catch (eR) {}\n";
    code += "    }\n";
    code += "  };\n";
    code += "  var host_get_args = (lib) => {\n";
    code += "    var argv = (lib.pc && lib.pc.argv) || (typeof process !== 'undefined' ? process.argv : []) || [];\n";
    code += "    var flags = ['--run', '--run-scm', '--test', '--json'];\n";
    code += "    for (var i = 0; i < argv.length; i++) {\n";
    code += "      if (flags.indexOf(argv[i]) !== -1) {\n";
    code += "        return argv.slice(i + 1).join('\\n');\n";
    code += "      }\n";
    code += "    }\n";
    code += "    return argv.slice(2).join('\\n');\n";
    code += "  };\n";
    if (hneed.http) {
    code += "  var host_http = (lib, param) => {\n";
    code += "    var nl = param.indexOf('\\n');\n";
    code += "    var line = nl === -1 ? param : param.slice(0, nl);\n";
    code += "    var rest = nl === -1 ? '' : param.slice(nl + 1);\n";
    code += "    var sp = line.indexOf(' ');\n";
    code += "    var method = (sp === -1 ? line : line.slice(0, sp)).toUpperCase() || 'GET';\n";
    code += "    var url = sp === -1 ? '' : line.slice(sp + 1);\n";
    code += "    var headers = {};\n";
    code += "    var body = rest;\n";
    code += "    var hdr_end = rest.indexOf('\\n\\n');\n";
    code += "    if (hdr_end >= 0) {\n";
    code += "      rest.slice(0, hdr_end).split('\\n').forEach(function(hline) {\n";
    code += "        var c = hline.indexOf(':');\n";
    code += "        if (c > 0) headers[hline.slice(0, c).trim()] = hline.slice(c + 1).trim();\n";
    code += "      });\n";
    code += "      body = rest.slice(hdr_end + 2);\n";
    code += "    } else {\n";
    code += "      var hlines = rest.split('\\n');\n";
    code += "      var hi = 0;\n";
    code += "      if (hlines[0] === '') hi = 1;\n";
    code += "      var hacc = [];\n";
    code += "      while (hi < hlines.length) {\n";
    code += "        var hline = hlines[hi];\n";
    code += "        var c = hline.indexOf(':');\n";
    code += "        if (c <= 0) break;\n";
    code += "        headers[hline.slice(0, c).trim()] = hline.slice(c + 1).trim();\n";
    code += "        hi++;\n";
    code += "      }\n";
    code += "      body = hlines.slice(hi).join('\\n');\n";
    code += "    }\n";
    code += "    if (!url) return Promise.resolve('1\\nbad url');\n";
    code += "    return new Promise((res) => {\n";
    code += "      try {\n";
    code += "        var mod = /^https:/.test(url) ? lib.hs : lib.ht;\n";
    code += "        if (!mod) { res('1\\nno http module'); return; }\n";
    code += "        var u = new URL(url);\n";
    code += "        var req = mod.request({method: method, hostname: u.hostname, port: u.port || (/^https:/.test(url) ? 443 : 80), path: u.pathname + u.search, headers: headers}, (r) => {\n";
    code += "          var data = '';\n";
    code += "          r.on('data', (c) => { data += c; });\n";
    code += "          r.on('end', () => res('0\\n' + r.statusCode + '\\n' + data));\n";
    code += "        });\n";
    code += "        req.on('error', (e) => res('1\\n' + String(e.message || e)));\n";
    code += "        if (method !== 'GET' && method !== 'HEAD' && body) req.write(body);\n";
    code += "        req.end();\n";
    code += "      } catch (e) { res('1\\n' + String(e && e.message || e)); }\n";
    code += "    });\n";
    code += "  };\n";
    }
    if (hneed.job || hneed.tcp || hneed.server || hneed.sse) {
    code += "  var HOST_JOBS = {}; var HOST_JOB_N = 0; var HOST_TCP = {}; var HOST_HTTP_SRV = {}; var HOST_TCP_N = 0; var HOST_SSE = Object.create(null);\n";
    }
    if (hneed.tcp) {
    code += "  var host_tcp_connect = (lib, param) => {\n";
    code += "    var p = String(param || '').split('\\n'); var host = p[0] || ''; var port = Number(p[1] || 0); var tlsOn = p[2] === '1';\n";
    code += "    return new Promise((res) => {\n";
    code += "      try {\n";
    code += "        var mod = tlsOn ? require('tls') : require('net');\n";
    code += "        var sock = tlsOn ? mod.connect({host: host, port: port, servername: host}, onup) : mod.connect({host: host, port: port}, onup);\n";
    code += "        var id = String(++HOST_TCP_N); var rec = {sock: sock, buf: Buffer.alloc(0), wait: null};\n";
    code += "        function onup() { HOST_TCP[id] = rec; res('0\\n' + id); }\n";
    code += "        sock.on('data', (c) => { rec.buf = Buffer.concat([rec.buf, c]); if (rec.wait) { var w = rec.wait; rec.wait = null; w(); } });\n";
    code += "        sock.on('error', (e) => res('1\\n' + String(e && e.message || e)));\n";
    code += "        sock.on('close', () => { delete HOST_TCP[id]; });\n";
    code += "      } catch (e) { res('1\\n' + String(e && e.message || e)); }\n";
    code += "    });\n";
    code += "  };\n";
    code += WS_FRAMES_SRC;
    code += "  var ws_take_frame_host = (rec) => {\n";
    code += "    var frame = ws_take_frame(rec);\n";
    code += "    if (frame && frame.ping) { try { rec.sock.write(Buffer.from([0x8A, 0x00])); } catch (eP) {} }\n";
    code += "    return frame;\n";
    code += "  };\n";
    code += "  var host_tcp_send = (lib, param) => {\n";
    code += "    var nl = param.indexOf('\\n'); var id = nl === -1 ? param : param.slice(0, nl); var data = nl === -1 ? '' : param.slice(nl + 1);\n";
    code += "    var rec = HOST_TCP[id]; if (!rec) return Promise.resolve('1\\nclosed');\n";
    code += "    if (rec.ws) rec.sock.write(ws_mask_frame(data));\n";
    code += "    else rec.sock.write(data);\n";
    code += "    return Promise.resolve('0\\n');\n";
    code += "  };\n";
    code += "  var host_tcp_recv = (lib, param) => {\n";
    code += "    var rec = HOST_TCP[param]; if (!rec) return Promise.resolve('1\\nclosed');\n";
    code += "    return host_abortable(lib, function(finish) {\n";
    code += "      var take = () => {\n";
    code += "        if (rec.ws) {\n";
    code += "          var frame = ws_take_frame_host(rec);\n";
    code += "          if (!frame) return false;\n";
    code += "          if (frame.ping) return take();\n";
    code += "          if (frame.close) { finish('1\\nclosed'); return true; }\n";
    code += "          finish('0\\n' + frame.text); return true;\n";
    code += "        }\n";
    code += "        if (rec.buf.length) { var s = rec.buf.toString('utf8'); rec.buf = Buffer.alloc(0); finish('0\\n' + s); return true; }\n";
    code += "        return false;\n";
    code += "      };\n";
    code += "      if (take()) return;\n";
    code += "      rec.wait = () => { take() || finish('0\\n'); };\n";
    code += "      var t = setTimeout(() => { if (rec.wait) { rec.wait = null; finish('0\\n'); } }, 3000);\n";
    code += "      host_on_abort(lib, function() { clearTimeout(t); rec.wait = null; });\n";
    code += "    });\n";
    code += "  };\n";
    }
    if (hneed.ws) {
    code += "  var host_ws_connect = (lib, param) => {\n";
    code += "    try {\n";
    code += "      var u = new URL(param); var tlsOn = u.protocol === 'wss:'; var port = Number(u.port || (tlsOn ? 443 : 80));\n";
    code += "      return host_tcp_connect(lib, u.hostname + '\\n' + port + '\\n' + (tlsOn ? '1' : '0')).then((raw) => {\n";
    code += "        if (raw.indexOf('0\\n') !== 0) return raw;\n";
    code += "        var id = raw.slice(2); var key = require('crypto').randomBytes(16).toString('base64');\n";
    code += "        var req = ws_handshake_request(param, key);\n";
    code += "        return host_tcp_send(lib, id + '\\n' + req).then(() => host_tcp_recv(lib, id)).then((r) => {\n";
    code += "          if (ws_handshake_ok(r)) {\n";
    code += "            if (HOST_TCP[id]) HOST_TCP[id].ws = true;\n";
    code += "            HOST_RES.push({kind: 'ws', id: id});\n";
    code += "            return '0\\n' + id;\n";
    code += "          }\n";
    code += "          return '1\\nws handshake';\n";
    code += "        });\n";
    code += "      });\n";
    code += "    } catch (e) { return Promise.resolve('1\\n' + String(e && e.message || e)); }\n";
    code += "  };\n";
    }
    if (hneed.server) {
    code += "  var host_http_cookie = (h) => {\n";
    code += "    var cookie = '';\n";
    code += "    try {\n";
    code += "      if (!h) cookie = '';\n";
    code += "      else if (typeof h.get === 'function') cookie = String(h.get('cookie') || h.get('Cookie') || '');\n";
    code += "      else cookie = String(h.cookie || h.Cookie || '');\n";
    code += "    } catch (eC) { cookie = ''; }\n";
    code += "    if (cookie.indexOf('\\n') >= 0 || cookie.indexOf('\\0') >= 0) cookie = '';\n";
    code += "    return cookie;\n";
    code += "  };\n";
    code += "  var host_http_payload = (ctype, body) => {\n";
    code += "    var c = String(ctype == null ? '' : ctype);\n";
    code += "    var b = String(body == null ? '' : body);\n";
    code += "    if (c.indexOf('image/') === 0) {\n";
    code += "      var raw = b;\n";
    code += "      var ix = raw.indexOf('base64,');\n";
    code += "      if (ix >= 0) raw = raw.slice(ix + 7);\n";
    code += "      try {\n";
    code += "        if (typeof Buffer !== 'undefined') return Buffer.from(raw, 'base64');\n";
    code += "        if (typeof atob === 'function') {\n";
    code += "          var bin = atob(raw);\n";
    code += "          var u8 = new Uint8Array(bin.length);\n";
    code += "          for (var k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);\n";
    code += "          return u8;\n";
    code += "        }\n";
    code += "      } catch (eP) { return b; }\n";
    code += "    }\n";
    code += "    return b;\n";
    code += "  };\n";
    code += "  var host_http_listen = (lib, param) => {\n";
    code += "    var port = Number(param);\n";
    code += "    if (!Number.isFinite(port) || port < 0 || port > 65535) return Promise.resolve('1\\nbad port');\n";
    code += "    if (HOST_HTTP_SRV[port] && HOST_HTTP_SRV[port].server) return Promise.resolve('0\\n');\n";
    code += "    if (typeof Bun !== 'undefined' && Bun.serve) {\n";
    code += "      var mailbox = []; var waiters = []; var replies = {}; var nid = 0;\n";
    code += "      try {\n";
    code += "        var server = Bun.serve({\n";
    code += "          port: port, hostname: '127.0.0.1',\n";
    code += "          async fetch(req) {\n";
    code += "            var id = String(++nid);\n";
    code += "            var u = new URL(req.url);\n";
    code += "            var ck = host_http_cookie(req.headers);\n";
    code += "            var rec = {id: id, method: req.method || 'GET', url: (u.pathname + u.search) || '/', cookie: ck, body: await req.text()};\n";
    code += "            return new Promise((resolve) => {\n";
    code += "              replies[id] = resolve;\n";
    code += "              if (waiters.length) waiters.shift()(rec); else mailbox.push(rec);\n";
    code += "            });\n";
    code += "          }\n";
    code += "        });\n";
    code += "        HOST_HTTP_SRV[port] = {server: server, mailbox: mailbox, waiters: waiters, replies: replies, bun: true};\n";
    code += "        return Promise.resolve('0\\n');\n";
    code += "      } catch (e) {}\n";
    code += "    }\n";
    code += "    if (!lib.ht) return Promise.resolve('1\\nno http module');\n";
    code += "    return new Promise((res) => {\n";
    code += "      var mailbox = []; var waiters = []; var replies = {}; var nid = 0;\n";
    code += "      var server = lib.ht.createServer((req, rres) => {\n";
    code += "        var chunks = [];\n";
    code += "        req.on('data', (c) => chunks.push(c));\n";
    code += "        req.on('end', () => {\n";
    code += "          var id = String(++nid);\n";
    code += "          var ck = host_http_cookie(req.headers);\n";
    code += "          var rec = {id: id, method: req.method || 'GET', url: req.url || '/', cookie: ck, body: Buffer.concat(chunks).toString('utf8')};\n";
    code += "          replies[id] = rres;\n";
    code += "          if (waiters.length) waiters.shift()(rec); else mailbox.push(rec);\n";
    code += "        });\n";
    code += "      });\n";
    code += "      server.on('error', (e) => res('1\\n' + String(e && e.message || e)));\n";
    code += "      server.listen(port, '127.0.0.1', () => {\n";
    code += "        HOST_HTTP_SRV[port] = {server: server, mailbox: mailbox, waiters: waiters, replies: replies};\n";
    code += "        res('0\\n');\n";
    code += "      });\n";
    code += "    });\n";
    code += "  };\n";
    code += "  var host_http_recv = (lib, param) => {\n";
    code += "    var port = Number(param) || 0; var srv = HOST_HTTP_SRV[port];\n";
    code += "    if (!srv) return Promise.resolve(host_err('closed'));\n";
    code += "    return host_abortable(lib, function(finish) {\n";
    code += "      var deliver = (rec) => finish('0\\n' + rec.id + '\\n' + rec.method + '\\n' + rec.url + '\\n' + (rec.cookie || '') + '\\n' + rec.body);\n";
    code += "      if (srv.mailbox.length) deliver(srv.mailbox.shift());\n";
    code += "      else {\n";
    code += "        var fn;\n";
    code += "        var t = setTimeout(() => {\n";
    code += "          var i = srv.waiters.indexOf(fn);\n";
    code += "          if (i >= 0) srv.waiters.splice(i, 1);\n";
    code += "          finish(host_ok(''));\n";
    code += "        }, 3000);\n";
    code += "        fn = (rec) => { clearTimeout(t); deliver(rec); };\n";
    code += "        srv.waiters.push(fn);\n";
    code += "        host_on_abort(lib, function() {\n";
    code += "          clearTimeout(t);\n";
    code += "          var i = srv.waiters.indexOf(fn);\n";
    code += "          if (i >= 0) srv.waiters.splice(i, 1);\n";
    code += "        });\n";
    code += "      }\n";
    code += "    });\n";
    code += "  };\n";
    code += "  var host_http_reply = (lib, param) => {\n";
    code += "    var nl = param.indexOf('\\n'); var id = nl === -1 ? param : param.slice(0, nl);\n";
    code += "    var rest = nl === -1 ? '' : param.slice(nl + 1);\n";
    code += "    var nl2 = rest.indexOf('\\n');\n";
    code += "    var status = Number(nl2 === -1 ? rest : rest.slice(0, nl2)) || 200;\n";
    code += "    var body = nl2 === -1 ? '' : rest.slice(nl2 + 1);\n";
    code += "    for (var p in HOST_HTTP_SRV) {\n";
    code += "      var r = HOST_HTTP_SRV[p].replies[id];\n";
    code += "      if (r) {\n";
    code += "        if (typeof r === 'function') { r(new Response(body, {status: status, headers: {'Content-Type': 'text/plain; charset=utf-8'}})); delete HOST_HTTP_SRV[p].replies[id]; return Promise.resolve('0\\n'); }\n";
    code += "        r.statusCode = status; r.setHeader('Content-Type', 'text/plain; charset=utf-8'); r.end(body); delete HOST_HTTP_SRV[p].replies[id]; return Promise.resolve('0\\n');\n";
    code += "      }\n";
    code += "    }\n";
    code += "    return Promise.resolve('1\\nno request');\n";
    code += "  };\n";
    code += "  var host_http_reply_ex = (lib, param) => {\n";
    code += "    var p1 = param.indexOf('\\n'); var id = p1 === -1 ? param : param.slice(0, p1);\n";
    code += "    var rest = p1 === -1 ? '' : param.slice(p1 + 1);\n";
    code += "    var p2 = rest.indexOf('\\n'); var status = Number(p2 === -1 ? rest : rest.slice(0, p2)) || 200;\n";
    code += "    var rest2 = p2 === -1 ? '' : rest.slice(p2 + 1);\n";
    code += "    var p3 = rest2.indexOf('\\n'); var ctype = p3 === -1 ? rest2 : rest2.slice(0, p3);\n";
    code += "    var body = p3 === -1 ? '' : rest2.slice(p3 + 1);\n";
    code += "    if (!ctype) ctype = 'text/plain; charset=utf-8';\n";
    code += "    var payload = host_http_payload(ctype, body);\n";
    code += "    for (var p in HOST_HTTP_SRV) {\n";
    code += "      var r = HOST_HTTP_SRV[p].replies[id];\n";
    code += "      if (r) {\n";
    code += "        if (typeof r === 'function') { r(new Response(payload, {status: status, headers: {'Content-Type': ctype}})); delete HOST_HTTP_SRV[p].replies[id]; return Promise.resolve('0\\n'); }\n";
    code += "        r.statusCode = status; r.setHeader('Content-Type', ctype); r.end(payload); delete HOST_HTTP_SRV[p].replies[id]; return Promise.resolve('0\\n');\n";
    code += "      }\n";
    code += "    }\n";
    code += "    return Promise.resolve('1\\nno request');\n";
    code += "  };\n";
    code += "  var host_http_stop = (lib, param) => {\n";
    code += "    var port = Number(param) || 0; var srv = HOST_HTTP_SRV[port];\n";
    code += "    if (!srv) return Promise.resolve('0\\n');\n";
    code += "    if (srv.bun) { try { srv.server.stop(); } catch (e) {} delete HOST_HTTP_SRV[port]; return Promise.resolve('0\\n'); }\n";
    code += "    return new Promise((res) => { srv.server.close(() => { delete HOST_HTTP_SRV[port]; res('0\\n'); }); });\n";
    code += "  };\n";
    code += "  var sse_drop = (bus, id) => {\n";
    code += "    var b = HOST_SSE[bus]; if (!b) return;\n";
    code += "    var c = b[id]; if (!c) return;\n";
    code += "    try {\n";
    code += "      if (c.kind === 'node' && c.res) { try { c.res.end(); } catch (e0) {} }\n";
    code += "      if (c.kind === 'bun' && c.controller) { try { c.controller.close(); } catch (e1) {} }\n";
    code += "    } catch (e2) {}\n";
    code += "    delete b[id];\n";
    code += "    if (!Object.keys(b).length) delete HOST_SSE[bus];\n";
    code += "  };\n";
    code += "  var sse_find_reply = (id) => {\n";
    code += "    for (var p in HOST_HTTP_SRV) {\n";
    code += "      var r = HOST_HTTP_SRV[p].replies[id];\n";
    code += "      if (r) return { port: p, rec: r, srv: HOST_HTTP_SRV[p] };\n";
    code += "    }\n";
    code += "    return null;\n";
    code += "  };\n";
    code += "  var host_sse_open = (lib, param) => {\n";
    code += "    try {\n";
    code += "      var p = String(param == null ? '' : param);\n";
    code += "      var nl = p.indexOf('\\n');\n";
    code += "      var id = nl < 0 ? p : p.slice(0, nl);\n";
    code += "      var bus = nl < 0 ? '' : p.slice(nl + 1);\n";
    code += "      if (!id || id.indexOf('\\n') >= 0) return Promise.resolve('1\\nempty_id');\n";
    code += "      if (!bus || bus.indexOf('\\n') >= 0 || bus.indexOf('\\0') >= 0) return Promise.resolve('1\\nempty_bus');\n";
    code += "      var found = sse_find_reply(id);\n";
    code += "      if (!found) return Promise.resolve('1\\nmissing');\n";
    code += "      if (!HOST_SSE[bus]) HOST_SSE[bus] = Object.create(null);\n";
    code += "      var hdrs = {'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive'};\n";
    code += "      var r = found.rec;\n";
    code += "      delete found.srv.replies[id];\n";
    code += "      if (typeof r === 'function') {\n";
    code += "        var enc = new TextEncoder();\n";
    code += "        var stream = new ReadableStream({\n";
    code += "          start: function(controller) {\n";
    code += "            HOST_SSE[bus][id] = {kind: 'bun', controller: controller, encoder: enc};\n";
    code += "            try { controller.enqueue(enc.encode(':ok\\n\\n')); } catch (e3) {}\n";
    code += "          },\n";
    code += "          cancel: function() { sse_drop(bus, id); }\n";
    code += "        });\n";
    code += "        r(new Response(stream, {status: 200, headers: hdrs}));\n";
    code += "        return Promise.resolve('0\\n');\n";
    code += "      }\n";
    code += "      r.statusCode = 200;\n";
    code += "      r.setHeader('Content-Type', hdrs['Content-Type']);\n";
    code += "      r.setHeader('Cache-Control', hdrs['Cache-Control']);\n";
    code += "      r.setHeader('Connection', hdrs['Connection']);\n";
    code += "      r.write(':ok\\n\\n');\n";
    code += "      HOST_SSE[bus][id] = {kind: 'node', res: r};\n";
    code += "      r.on('close', function() { sse_drop(bus, id); });\n";
    code += "      r.on('error', function() { sse_drop(bus, id); });\n";
    code += "      return Promise.resolve('0\\n');\n";
    code += "    } catch (e) { return Promise.resolve('1\\n' + String(e && e.message || e)); }\n";
    code += "  };\n";
    code += "  var host_sse_send = (lib, param) => {\n";
    code += "    try {\n";
    code += "      var p = String(param == null ? '' : param);\n";
    code += "      var nl = p.indexOf('\\n');\n";
    code += "      var bus = nl < 0 ? p : p.slice(0, nl);\n";
    code += "      var payload = nl < 0 ? '' : p.slice(nl + 1);\n";
    code += "      if (!bus) return Promise.resolve('1\\nempty_bus');\n";
    code += "      var b = HOST_SSE[bus] || Object.create(null);\n";
    code += "      var n = 0;\n";
    code += "      var ids = Object.keys(b);\n";
    code += "      for (var i = 0; i < ids.length; i++) {\n";
    code += "        var id = ids[i]; var c = b[id]; if (!c) continue;\n";
    code += "        try {\n";
    code += "          if (c.kind === 'node' && c.res) { if (payload) c.res.write(payload); n++; }\n";
    code += "          else if (c.kind === 'bun' && c.controller && c.encoder) { if (payload) c.controller.enqueue(c.encoder.encode(payload)); n++; }\n";
    code += "        } catch (e4) { sse_drop(bus, id); }\n";
    code += "      }\n";
    code += "      return Promise.resolve('0\\n' + String(n));\n";
    code += "    } catch (e) { return Promise.resolve('1\\n' + String(e && e.message || e)); }\n";
    code += "  };\n";
    code += "  var host_sse_close = (lib, param) => {\n";
    code += "    try {\n";
    code += "      var id = String(param == null ? '' : param);\n";
    code += "      if (!id) return Promise.resolve('1\\nempty_id');\n";
    code += "      var buses = Object.keys(HOST_SSE);\n";
    code += "      for (var i = 0; i < buses.length; i++) {\n";
    code += "        if (HOST_SSE[buses[i]] && HOST_SSE[buses[i]][id]) sse_drop(buses[i], id);\n";
    code += "      }\n";
    code += "      return Promise.resolve('0\\n');\n";
    code += "    } catch (e) { return Promise.resolve('1\\n' + String(e && e.message || e)); }\n";
    code += "  };\n";
    code += "  var host_sse_count = (lib, param) => {\n";
    code += "    try {\n";
    code += "      var bus = String(param == null ? '' : param);\n";
    code += "      if (!bus) return Promise.resolve('1\\nempty_bus');\n";
    code += "      var b = HOST_SSE[bus];\n";
    code += "      return Promise.resolve('0\\n' + String(b ? Object.keys(b).length : 0));\n";
    code += "    } catch (e) { return Promise.resolve('1\\n' + String(e && e.message || e)); }\n";
    code += "  };\n";
    code += "  var host_http_reply_hdr = (lib, param) => {\n";
    code += "    try {\n";
    code += "      var p = String(param == null ? '' : param);\n";
    code += "      var i = p.indexOf('\\n'); var id = i < 0 ? p : p.slice(0, i); var rest = i < 0 ? '' : p.slice(i + 1);\n";
    code += "      if (!id) return Promise.resolve('1\\nempty_id');\n";
    code += "      var j = rest.indexOf('\\n'); var status = Number(j < 0 ? rest : rest.slice(0, j)) || 200; var rest2 = j < 0 ? '' : rest.slice(j + 1);\n";
    code += "      var split = rest2.indexOf('\\n\\n'); var hdrs = split < 0 ? rest2 : rest2.slice(0, split); var body = split < 0 ? '' : rest2.slice(split + 2);\n";
    code += "      var headers = {};\n";
    code += "      var lines = hdrs.split('\\n');\n";
    code += "      for (var hi = 0; hi < lines.length; hi++) {\n";
    code += "        var line = lines[hi]; var c = line.indexOf(':');\n";
    code += "        if (c <= 0) continue;\n";
    code += "        var k = line.slice(0, c).replace(/^\\s+|\\s+$/g, ''); var v = line.slice(c + 1).replace(/^\\s+|\\s+$/g, '');\n";
    code += "        if (k) headers[k] = v;\n";
    code += "      }\n";
    code += "      if (!headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = 'text/plain; charset=utf-8';\n";
    code += "      var payload = host_http_payload(headers['Content-Type'] || headers['content-type'] || '', body);\n";
    code += "      var found = sse_find_reply(id);\n";
    code += "      if (!found) return Promise.resolve('1\\nmissing');\n";
    code += "      var r = found.rec; delete found.srv.replies[id];\n";
    code += "      if (typeof r === 'function') { r(new Response(payload, {status: status, headers: headers})); return Promise.resolve('0\\n'); }\n";
    code += "      r.statusCode = status;\n";
    code += "      var hk = Object.keys(headers);\n";
    code += "      for (var h = 0; h < hk.length; h++) r.setHeader(hk[h], headers[hk[h]]);\n";
    code += "      r.end(payload);\n";
    code += "      return Promise.resolve('0\\n');\n";
    code += "    } catch (e) { return Promise.resolve('1\\n' + String(e && e.message || e)); }\n";
    code += "  };\n";
    }
    if (hneed.db) {
    code += "  var HOST_DB = {};\n";
    code += "  var db_ok = (m) => Promise.resolve('0\\n' + String(m == null ? '' : m));\n";
    code += "  var db_err = (m) => Promise.resolve('1\\n' + String(m == null ? '' : m));\n";
    code += "  var db_safe_key = (k) => {\n";
    code += "    if (!k) return 'empty key';\n";
    code += "    if (k.indexOf('\\n') >= 0 || k.indexOf('\\0') >= 0) return 'bad key';\n";
    code += "    return null;\n";
    code += "  };\n";
    code += "  var db_safe_file = (p) => {\n";
    code += "    if (!p) return false;\n";
    code += "    if (p.indexOf('..') >= 0 || p.charAt(0) === '/' || p.indexOf('\\\\') >= 0) return false;\n";
    code += "    if (p.indexOf('\\0') >= 0) return false;\n";
    code += "    return true;\n";
    code += "  };\n";
    code += "  var db_load_map = (j) => {\n";
    code += "    if (!j || typeof j !== 'object' || Array.isArray(j)) return null;\n";
    code += "    var data = Object.create(null);\n";
    code += "    var ks = Object.keys(j);\n";
    code += "    for (var i = 0; i < ks.length; i++) {\n";
    code += "      var k = ks[i];\n";
    code += "      if (db_safe_key(k) || typeof j[k] !== 'string') return null;\n";
    code += "      data[k] = j[k];\n";
    code += "    }\n";
    code += "    return data;\n";
    code += "  };\n";
    code += "  var db_persist = (lib, store) => {\n";
    code += "    if (!store || store.kind !== 'file') return true;\n";
    code += "    var tmp = store.path + '.tmp';\n";
    code += "    try {\n";
    code += "      lib.fs.writeFileSync(tmp, JSON.stringify(store.data || Object.create(null)));\n";
    code += "      lib.fs.renameSync(tmp, store.path);\n";
    code += "      return true;\n";
    code += "    } catch (e) {\n";
    code += "      try { lib.fs.unlinkSync(tmp); } catch (e2) {}\n";
    code += "      store.last_err = String(e && e.message || e);\n";
    code += "      return false;\n";
    code += "    }\n";
    code += "  };\n";
    code += "  var db_split1 = (param) => {\n";
    code += "    var p = String(param || ''); var nl = p.indexOf('\\n');\n";
    code += "    return nl === -1 ? { id: p, rest: '' } : { id: p.slice(0, nl), rest: p.slice(nl + 1) };\n";
    code += "  };\n";
    code += "  var db_store = (id) => {\n";
    code += "    var store = HOST_DB[id];\n";
    code += "    if (!store || store.closed || !store.data) return null;\n";
    code += "    return store;\n";
    code += "  };\n";
    code += "  var host_db_connect = (lib, param) => {\n";
    code += "    var url = String(param || '');\n";
    code += "    if (!url) return db_err('empty url');\n";
    code += "    if (url.indexOf('suremem:') === 0) {\n";
    code += "      if (!HOST_DB[url] || HOST_DB[url].kind !== 'mem') HOST_DB[url] = { kind: 'mem', data: Object.create(null) };\n";
    code += "      HOST_DB[url].closed = false;\n";
    code += "      return db_ok(url);\n";
    code += "    }\n";
    code += "    if (url.indexOf('surefile:') === 0) {\n";
    code += "      var fpath = url.slice(9);\n";
    code += "      if (!db_safe_file(fpath)) return db_err('bad db url');\n";
    code += "      try {\n";
    code += "        if (lib.fs.existsSync(fpath)) {\n";
    code += "          var st = lib.fs.statSync(fpath);\n";
    code += "          if (!st.isFile()) return db_err('bad db file');\n";
    code += "          var t = lib.fs.readFileSync(fpath, 'utf8');\n";
    code += "          var data = db_load_map(JSON.parse(t));\n";
    code += "          if (!data) return db_err('bad db file');\n";
    code += "          HOST_DB[url] = { kind: 'file', path: fpath, data: data };\n";
    code += "          return db_ok(url);\n";
    code += "        }\n";
    code += "      } catch (e) { return db_err('bad db file'); }\n";
    code += "      HOST_DB[url] = { kind: 'file', path: fpath, data: Object.create(null) };\n";
    code += "      return db_ok(url);\n";
    code += "    }\n";
    code += "    return db_err('bad db url');\n";
    code += "  };\n";
    code += "  var host_db_get = (lib, param) => {\n";
    code += "    var s = db_split1(param); var bad = db_safe_key(s.rest); if (bad) return db_err(bad);\n";
    code += "    var store = db_store(s.id); if (!store) return db_err('closed');\n";
    code += "    if (!Object.prototype.hasOwnProperty.call(store.data, s.rest)) return db_err('missing');\n";
    code += "    return db_ok(String(store.data[s.rest]));\n";
    code += "  };\n";
    code += "  var host_db_set = (lib, param) => {\n";
    code += "    var s = db_split1(param); var nl2 = s.rest.indexOf('\\n');\n";
    code += "    var key = nl2 === -1 ? s.rest : s.rest.slice(0, nl2); var val = nl2 === -1 ? '' : s.rest.slice(nl2 + 1);\n";
    code += "    var bad = db_safe_key(key); if (bad) return db_err(bad);\n";
    code += "    var store = db_store(s.id); if (!store) return db_err('closed');\n";
    code += "    store.data[key] = String(val);\n";
    code += "    if (!db_persist(lib, store)) return db_err(store.last_err || 'persist');\n";
    code += "    return db_ok('');\n";
    code += "  };\n";
    code += "  var host_db_del = (lib, param) => {\n";
    code += "    var s = db_split1(param); var bad = db_safe_key(s.rest); if (bad) return db_err(bad);\n";
    code += "    var store = db_store(s.id); if (!store) return db_err('closed');\n";
    code += "    if (!Object.prototype.hasOwnProperty.call(store.data, s.rest)) return db_err('missing');\n";
    code += "    delete store.data[s.rest];\n";
    code += "    if (!db_persist(lib, store)) return db_err(store.last_err || 'persist');\n";
    code += "    return db_ok('');\n";
    code += "  };\n";
    code += "  var host_db_has = (lib, param) => {\n";
    code += "    var s = db_split1(param); var bad = db_safe_key(s.rest); if (bad) return db_err(bad);\n";
    code += "    var store = db_store(s.id); if (!store) return db_err('closed');\n";
    code += "    return db_ok(Object.prototype.hasOwnProperty.call(store.data, s.rest) ? '1' : '0');\n";
    code += "  };\n";
    code += "  var host_db_keys = (lib, param) => {\n";
    code += "    var store = db_store(String(param || '')); if (!store) return db_err('closed');\n";
    code += "    return db_ok(JSON.stringify(Object.keys(store.data)));\n";
    code += "  };\n";
    code += "  var host_db_clear = (lib, param) => {\n";
    code += "    var store = db_store(String(param || '')); if (!store) return db_err('closed');\n";
    code += "    store.data = Object.create(null);\n";
    code += "    if (!db_persist(lib, store)) return db_err(store.last_err || 'persist');\n";
    code += "    return db_ok('');\n";
    code += "  };\n";
    code += "  var host_db_query = async (lib, param) => {\n";
    code += "    var s = db_split1(param); var t = String(s.rest || '').replace(/^\\s+|\\s+$/g, '');\n";
    code += "    if (!t) return '1\\nbad query';\n";
    code += "    if (t === 'KEYS') return host_db_keys(lib, s.id);\n";
    code += "    if (t === 'CLEAR') return host_db_clear(lib, s.id);\n";
    code += "    if (t.indexOf('GET ') === 0) return host_db_get(lib, s.id + '\\n' + t.slice(4).replace(/^\\s+|\\s+$/g, ''));\n";
    code += "    if (t.indexOf('DEL ') === 0) return host_db_del(lib, s.id + '\\n' + t.slice(4).replace(/^\\s+|\\s+$/g, ''));\n";
    code += "    if (t.indexOf('HAS ') === 0) return host_db_has(lib, s.id + '\\n' + t.slice(4).replace(/^\\s+|\\s+$/g, ''));\n";
    code += "    if (t.indexOf('SET ') === 0) {\n";
    code += "      var rest = t.slice(4).replace(/^\\s+/, ''); var sp = rest.indexOf(' ');\n";
    code += "      var k = sp === -1 ? rest : rest.slice(0, sp); var v = sp === -1 ? '' : rest.slice(sp + 1);\n";
    code += "      return host_db_set(lib, s.id + '\\n' + k + '\\n' + v);\n";
    code += "    }\n";
    code += "    return '1\\nbad query';\n";
    code += "  };\n";
    code += "  var host_db_close = (lib, param) => {\n";
    code += "    var store = HOST_DB[String(param || '')];\n";
    code += "    if (store) {\n";
    code += "      if (store.kind === 'file') db_persist(lib, store);\n";
    code += "      store.closed = true;\n";
    code += "    }\n";
    code += "    return Promise.resolve('0\\n');\n";
    code += "  };\n";
    }
    if (hneed.proc) {
    code += HOST_PACK_SRC;
    code += "  var host_proc_run = (lib, param) => {\n";
    code += "    return new Promise((res) => {\n";
    code += "      try {\n";
    code += "        var spec = host_parse_argv(param);\n";
    code += "        if (spec.error) { res(host_err(spec.error)); return; }\n";
    code += "        if (!spec.file) { res(host_err('empty_name')); return; }\n";
    code += "        var child = require('child_process').spawn(spec.file, spec.args, {cwd: spec.cwd || undefined, env: spec.env, shell: false, timeout: 8000, stdio: ['ignore', 'pipe', 'pipe']});\n";
    code += "        var out = ''; var done = false;\n";
    code += "        if (child.stdout) child.stdout.on('data', function(d) { out += d; });\n";
    code += "        var finish = function(code, err) {\n";
    code += "          if (done) return; done = true;\n";
    code += "          if (err) res(host_err(err));\n";
    code += "          else res(host_ok(String(code == null ? 1 : code) + '\\n' + out));\n";
    code += "        };\n";
    code += "        child.on('error', function(e) { finish(1, String(e && e.message || e)); });\n";
    code += "        child.on('close', function(c) { finish(c, null); });\n";
    code += "        var ac = lib && lib.abort;\n";
    code += "        if (ac && ac.signal) {\n";
    code += "          var kill = function() { try { child.kill('SIGTERM'); } catch (eK) {} finish(1, 'cancelled'); };\n";
    code += "          if (ac.signal.aborted) kill();\n";
    code += "          else ac.signal.addEventListener('abort', kill, {once: true});\n";
    code += "        }\n";
    code += "      } catch (e) { res(host_err(String(e && e.message || e))); }\n";
    code += "    });\n";
    code += "  };\n";
    code += "  var host_proc_unsafe_shell = (lib, param) => {\n";
    code += "    return new Promise((res) => {\n";
    code += "      try {\n";
    code += "        require('child_process').exec(param, {timeout: 8000, maxBuffer: 1048576, encoding: 'utf8', shell: true}, (err, stdout) => {\n";
    code += "          var code = 0;\n";
    code += "          if (err && typeof err.code === 'number') code = err.code;\n";
    code += "          else if (err) code = 1;\n";
    code += "          res(host_ok(String(code) + '\\n' + String(stdout || '')));\n";
    code += "        });\n";
    code += "      } catch (e) { res(host_err(String(e && e.message || e))); }\n";
    code += "    });\n";
    code += "  };\n";
    code += "  var host_proc_exec = host_proc_unsafe_shell;\n";
    code += "  var HOST_PROCS = {};\n";
    code += "  var host_proc_spawn_ex = (lib, param) => {\n";
    code += "    try {\n";
    code += "      var spec = host_parse_argv(param);\n";
    code += "      if (spec.error) return Promise.resolve(host_err(spec.error));\n";
    code += "      if (!spec.file) return Promise.resolve(host_err('empty_name'));\n";
    code += "      var child = require('child_process').spawn(spec.file, spec.args, {cwd: spec.cwd || undefined, env: spec.env, shell: false, stdio: 'ignore'});\n";
    code += "      var rec = {child: child, code: null, done: null};\n";
    code += "      rec.done = new Promise((res) => { child.on('exit', (c) => { rec.code = (c == null ? 1 : c); res(rec.code); }); });\n";
    code += "      HOST_PROCS[String(child.pid)] = rec;\n";
    code += "      return Promise.resolve(host_ok(String(child.pid)));\n";
    code += "    } catch (e) { return Promise.resolve(host_err(String(e && e.message || e))); }\n";
    code += "  };\n";
    code += "  var host_proc_spawn = (lib, param) => {\n";
    code += "    try {\n";
    code += "      var spec = host_parse_argv(param);\n";
    code += "      if (spec.error) return Promise.resolve(host_err(spec.error));\n";
    code += "      if (!spec.file) return Promise.resolve(host_err('empty_name'));\n";
    code += "      var child = require('child_process').spawn(spec.file, spec.args, {cwd: spec.cwd || undefined, env: spec.env, shell: false, stdio: 'ignore'});\n";
    code += "      var rec = {child: child, code: null, done: null};\n";
    code += "      rec.done = new Promise((res) => { child.on('exit', (c) => { rec.code = (c == null ? 1 : c); res(rec.code); }); });\n";
    code += "      HOST_PROCS[String(child.pid)] = rec;\n";
    code += "      return Promise.resolve(host_ok(String(child.pid)));\n";
    code += "    } catch (e) { return Promise.resolve(host_err(String(e && e.message || e))); }\n";
    code += "  };\n";
    code += "  var host_proc_kill = (lib, param) => {\n";
    code += "    try {\n";
    code += "      var nl = param.indexOf('\\n'); var pid = nl === -1 ? param : param.slice(0, nl); var sig = nl === -1 ? 'SIGTERM' : param.slice(nl + 1);\n";
    code += "      process.kill(Number(pid), sig || 'SIGTERM');\n";
    code += "      return Promise.resolve('0\\n');\n";
    code += "    } catch (e) { return Promise.resolve('1\\n' + String(e && e.message || e)); }\n";
    code += "  };\n";
    code += "  var host_proc_wait = async (lib, param) => {\n";
    code += "    var rec = HOST_PROCS[param];\n";
    code += "    if (!rec) return '1\\nno pid';\n";
    code += "    return host_abortable(lib, function(finish) {\n";
    code += "      rec.done.then(function(code) { finish('0\\n' + String(code)); });\n";
    code += "    });\n";
    code += "  };\n";
    }
    if (hneed.job) {
    code += "  var host_job_start = (lib, spec) => {\n";
    code += "    var nl = spec.indexOf('\\n'); var kind = nl === -1 ? spec : spec.slice(0, nl); var arg = nl === -1 ? '' : spec.slice(nl + 1);\n";
    code += "    var id = String(++HOST_JOB_N); var ctrl = {}; var p;\n";
    code += "    if (kind === 'sleep') { p = new Promise((res) => { var t = setTimeout(() => res('0\\n'), Number(arg) || 0); ctrl.cancel = () => { clearTimeout(t); res('1\\ncancelled'); }; }); }\n";
    code += "    else if (kind === 'http') { p = host_http(lib, arg); ctrl.cancel = () => {}; }\n";
    code += "    else if (kind === 'yield') { p = Promise.resolve('0\\n'); ctrl.cancel = () => {}; }\n";
    code += "    else { p = Promise.resolve('1\\nbad job'); ctrl.cancel = () => {}; }\n";
    code += "    HOST_JOBS[id] = { promise: p, ctrl: ctrl }; return id;\n";
    code += "  };\n";
    }
    if (hneed.http) {
    code += "  var request = (lib, param) => {\n";
    code += "    if (/raw\\.githubusercontent\\.com\\/(HigherOrderCO|Kindelia)\\/Kind/i.test(param) &&\n";
    code += "        !(typeof process !== 'undefined' && process.env && (process.env.SURE_FETCH_BASE === '1' || process.env.KIND_FETCH_BASE === '1'))) {\n";
    code += "      return Promise.resolve('');\n";
    code += "    }\n";
    code += "    var ac = lib && lib.abort;\n";
    code += "    if (typeof fetch === 'undefined') {\n";
    code += "      return host_abortable(lib, function(finish) {\n";
    code += "        var req = (/^https/.test(param)?lib.hs:lib.ht).get(param, r => {\n";
    code += "          let data = '';\n";
    code += "          r.on('data', chunk => { data += chunk; });\n";
    code += "          r.on('end', () => finish(data));\n";
    code += "        });\n";
    code += "        req.on('error', e => finish(''));\n";
    code += "        host_on_abort(lib, function() { try { req.destroy(); } catch (eD) {} });\n";
    code += "      });\n";
    code += "    } else {\n";
    code += "      var opts = {};\n";
    code += "      if (ac && ac.signal) opts.signal = ac.signal;\n";
    code += "      return fetch(param, opts).then(res => res.text()).catch(e => '');\n";
    code += "    }\n";
    code += "  }\n";
    }
    if (hneed.udp) {
    code += "  let PORTS = {};\n"
    code += "  function init_udp(lib, port_num) {\n";
    code += "    return new Promise((resolve, reject) => {\n";
    code += "      if (!PORTS[port_num]) {\n";
    code += "        PORTS[port_num] = {socket: lib.dg.createSocket('udp4'), mailbox: []};\n";
    code += "        PORTS[port_num].socket.bind(port_num);\n";
    code += "        PORTS[port_num].socket.on('listening', () => resolve(PORTS[port_num]));\n";
    code += "        PORTS[port_num].socket.on('message', (data, peer) => {\n";
    code += "          var ip = peer.address;\n";
    code += "          var port = peer.port;\n";
    code += "          PORTS[port_num].mailbox.push({ip: peer.address, port: peer.port, data: data.toString('hex')});\n";
    code += "        })\n";
    code += "        PORTS[port_num].socket.on('error', (err) => {\n";
    code += "          console.log('err');\n";
    code += "          reject('UDP init error.');\n";
    code += "        });\n";
    code += "      } else {\n";
    code += "        resolve(PORTS[port_num]);\n";
    code += "      }\n";
    code += "    });\n";
    code += "  }\n";
    code += "  async function send_udp(lib, port_num, to_ip, to_port_num, data) {\n";
    code += "    var port = await init_udp(lib, port_num);\n";
    code += "    var buf = Buffer.from(data || '', 'hex');\n";
    code += "    await new Promise((res, rej) => {\n";
    code += "      port.socket.send(buf, to_port_num, to_ip, (err) => err ? rej(err) : res());\n";
    code += "    });\n";
    code += "    return null;\n";
    code += "  }\n";
    code += "  async function recv_udp(lib, port_num) {\n";
    code += "    var port = await init_udp(lib, port_num);\n";
    code += "    var mailbox = port.mailbox;\n";
    code += "    port.mailbox = [];\n";
    code += "    return mailbox;\n";
    code += "  }\n";
    code += "  async function stop_udp(lib, port_num) {\n";
    code += "    var p = PORTS[port_num];\n";
    code += "    if (!p) return;\n";
    code += "    await new Promise((res) => { try { p.socket.close(() => res()); } catch (e) { res(); } });\n";
    code += "    delete PORTS[port_num];\n";
    code += "  }\n";
    }
    if (hneed.file) {
    code += "  var file_error = e => {\n";
    code += "    return host_err((e && e.code === 'ENOENT') ? 'ENOENT' : String(e && e.message || e));\n";
    code += "  };\n";
    }
    if (hneed.ffi) {
    code += "  var host_ffi = async (lib, param) => {\n";
    code += "    var p = String(param == null ? '' : param);\n";
    code += "    var nl = p.indexOf('\\n');\n";
    code += "    var name = nl < 0 ? p : p.slice(0, nl);\n";
    code += "    var body = nl < 0 ? '' : p.slice(nl + 1);\n";
    code += "    if (!name) return '1\\nempty_name';\n";
    code += "    if (/[\\n\\/\\\\]/.test(name) || name.indexOf('..') >= 0) return '1\\nbad_name';\n";
    code += "    if (!/^[A-Za-z_$][A-Za-z0-9_$.]*$/.test(name)) return '1\\nbad_name';\n";
    code += "    var g = (typeof globalThis !== 'undefined') ? globalThis : {};\n";
    code += "    if (!g.SURE_FFI) g.SURE_FFI = {};\n";
    code += "    if (typeof g.SURE_FFI['Sure.ffi.add'] !== 'function') {\n";
    code += "      g.SURE_FFI['Sure.ffi.add'] = function(a, b) { return Number(a) + Number(b); };\n";
    code += "    }\n";
    code += "    if (typeof g.SURE_FFI['Sure.ffi.boom'] !== 'function') {\n";
    code += "      g.SURE_FFI['Sure.ffi.boom'] = function() { throw new Error('boom'); };\n";
    code += "    }\n";
    code += "    var fn = g.SURE_FFI[name];\n";
    code += "    if (typeof fn !== 'function') {\n";
    code += "      var cur = g; var parts = name.split('.'); var okp = true;\n";
    code += "      for (var i = 0; i < parts.length; i++) {\n";
    code += "        if (cur == null || (typeof cur !== 'object' && typeof cur !== 'function')) { okp = false; break; }\n";
    code += "        cur = cur[parts[i]];\n";
    code += "      }\n";
    code += "      fn = okp && typeof cur === 'function' ? cur : null;\n";
    code += "    }\n";
    code += "    if (typeof fn !== 'function') return '1\\nmissing';\n";
    code += "    var jsarg;\n";
    code += "    if (body === '') jsarg = undefined;\n";
    code += "    else { try { jsarg = JSON.parse(body); } catch (e) { return '1\\nbad_json'; } }\n";
    code += "    try {\n";
    code += "      var result = await Promise.resolve(Array.isArray(jsarg) ? fn.apply(null, jsarg) : (jsarg === undefined ? fn() : fn(jsarg)));\n";
    code += "      var out;\n";
    code += "      try { out = JSON.stringify(result === undefined ? null : result); }\n";
    code += "      catch (e2) { return '1\\ndecode'; }\n";
    code += "      if (typeof out !== 'string') return '1\\ndecode';\n";
    code += "      return '0\\n' + out;\n";
    code += "    } catch (e3) { return '1\\nthrow\\n' + String(e3 && e3.message || e3); }\n";
    code += "  };\n";
    }
    if (hneed.worker) {
    code += "  var host_worker_apply_src = [\n";
    code += "    'function applyName(name, jsarg) {',\n";
    code += "    '  var fn = null;',\n";
    code += "    \"  if (name === 'Sure.ffi.add') fn = function(a,b){ return Number(a)+Number(b); };\",\n";
    code += "    \"  else if (name === 'Sure.ffi.boom') fn = function(){ throw new Error('boom'); };\",\n";
    code += "    \"  else if (name === 'Sure.worker.double') fn = function(a){ return Number(a)*2; };\",\n";
    code += "    \"  else if (name.slice(0,5) === 'Math.') { var m = Math[name.slice(5)]; if (typeof m === 'function') fn = m.bind(Math); }\",\n";
    code += "    \"  if (typeof fn !== 'function') return '1\\\\nmissing';\",\n";
    code += "    '  var result = Array.isArray(jsarg) ? fn.apply(null, jsarg) : (jsarg === undefined ? fn() : fn(jsarg));',\n";
    code += "    \"  var out = JSON.stringify(result === undefined ? null : result);\",\n";
    code += "    \"  if (typeof out !== 'string') return '1\\\\ndecode';\",\n";
    code += "    \"  return '0\\\\n' + out;\",\n";
    code += "    '}'\n";
    code += "  ].join('\\n');\n";
    code += "  var host_worker_run = async (lib, param) => {\n";
    code += "    try {\n";
    code += "      var p = String(param == null ? '' : param);\n";
    code += "      var nl = p.indexOf('\\n');\n";
    code += "      var name = nl < 0 ? p : p.slice(0, nl);\n";
    code += "      var body = nl < 0 ? '' : p.slice(nl + 1);\n";
    code += "      if (!name) return '1\\nempty_name';\n";
    code += "      if (/[\\n\\/\\\\]/.test(name) || name.indexOf('..') >= 0) return '1\\nbad_name';\n";
    code += "      if (!/^[A-Za-z_$][A-Za-z0-9_$.]*$/.test(name)) return '1\\nbad_name';\n";
    code += "      if (body !== '') { try { JSON.parse(body); } catch (e0) { return '1\\nbad_json'; } }\n";
    code += "      var data = { name: name, body: body };\n";
    code += "      if (typeof Bun !== 'undefined' && typeof Worker !== 'undefined') {\n";
    code += "        var bunSrc = host_worker_apply_src + '\\nself.onmessage = function(ev) {\\n' +\n";
    code += "          '  try {\\n' +\n";
    code += "          '    var name = ev.data.name; var body = ev.data.body;\\n' +\n";
    code += "          \"    var jsarg; if (body === '') jsarg = undefined; else jsarg = JSON.parse(body);\\n\" +\n";
    code += "          '    self.postMessage(applyName(name, jsarg));\\n' +\n";
    code += "          '  } catch (e) {\\n' +\n";
    code += "          \"    if (e && e.name === 'SyntaxError') self.postMessage('1\\\\nbad_json');\\n\" +\n";
    code += "          \"    else self.postMessage('1\\\\nthrow\\\\n' + String(e && e.message || e));\\n\" +\n";
    code += "          '  }\\n' +\n";
    code += "          '};\\n';\n";
    code += "        var blob = new Blob([bunSrc], { type: 'application/javascript' });\n";
    code += "        var url = URL.createObjectURL(blob);\n";
    code += "        return await new Promise((resolve) => {\n";
    code += "          var done = false;\n";
    code += "          var w = new Worker(url);\n";
    code += "          var finish = (s) => { if (!done) { done = true; try { w.terminate(); } catch (e1) {} try { URL.revokeObjectURL(url); } catch (e2) {} resolve(s); } };\n";
    code += "          w.onmessage = (ev) => finish(String(ev.data));\n";
    code += "          w.onerror = (err) => finish('1\\nthrow\\n' + String(err && err.message || err));\n";
    code += "          try { w.postMessage(data); } catch (e3) { finish('1\\nthrow\\n' + String(e3 && e3.message || e3)); }\n";
    code += "        });\n";
    code += "      }\n";
    code += "      var wt;\n";
    code += "      try { wt = require('worker_threads'); } catch (e4) { return '1\\nno_thread'; }\n";
    code += "      if (!wt || typeof wt.Worker !== 'function') return '1\\nno_thread';\n";
    code += "      var nodeSrc = host_worker_apply_src + '\\n' +\n";
    code += "        \"const { parentPort, workerData } = require('worker_threads');\\n\" +\n";
    code += "        'try {\\n' +\n";
    code += "        '  var name = workerData.name; var body = workerData.body;\\n' +\n";
    code += "        \"  var jsarg; if (body === '') jsarg = undefined; else jsarg = JSON.parse(body);\\n\" +\n";
    code += "        '  parentPort.postMessage(applyName(name, jsarg));\\n' +\n";
    code += "        '} catch (e) {\\n' +\n";
    code += "        \"  if (e && e.name === 'SyntaxError') parentPort.postMessage('1\\\\nbad_json');\\n\" +\n";
    code += "        \"  else parentPort.postMessage('1\\\\nthrow\\\\n' + String(e && e.message || e));\\n\" +\n";
    code += "        '}\\n';\n";
    code += "      return await new Promise((resolve) => {\n";
    code += "        var done = false;\n";
    code += "        var w;\n";
    code += "        var finish = (s) => { if (!done) { done = true; try { if (w) w.terminate(); } catch (e5) {} resolve(s); } };\n";
    code += "        try {\n";
    code += "          w = new wt.Worker(nodeSrc, { eval: true, workerData: data });\n";
    code += "        } catch (e6) { finish('1\\nno_thread'); return; }\n";
    code += "        w.on('message', (msg) => finish(String(msg)));\n";
    code += "        w.on('error', (err) => finish('1\\nthrow\\n' + String(err && err.message || err)));\n";
    code += "        w.on('exit', (code) => { if (!done && code) finish('1\\nthrow\\nexit ' + String(code)); });\n";
    code += "      });\n";
    code += "    } catch (e7) { return '1\\nthrow\\n' + String(e7 && e7.message || e7); }\n";
    code += "  };\n";
    }
    code += "  var io_action = {\n";
    code += "    print: async (lib, param) => {\n";
    code += "      console.log(param);\n";
    code += "      return host_ok('');\n";
    code += "    },\n";
    code += "    put_string: async (lib, param) => {\n";
    code += "      process.stdout.write(param);\n";
    code += "      return host_ok('');\n";
    code += "    },\n";
    if (hneed.file) {
    code += "    get_file: async (lib, param) => {\n";
    code += "      try {\n";
    code += "        return get_file(lib, param);\n";
    code += "      } catch (e) {\n";
    code += "        return file_error(e);\n";
    code += "      }\n";
    code += "    },\n";
    code += "    set_file: async (lib, param) => {\n";
    code += "      try {\n";
    code += "        return set_file(lib, param)\n";
    code += "      } catch (e) {\n";
    code += "        return file_error(e);\n";
    code += "      }\n";
    code += "    },\n";
    code += "    del_file: async (lib, param) => {\n";
    code += "      try {\n";
    code += "        return del_file(lib, param);\n";
    code += "      } catch (e) {\n";
    code += "        return file_error(e);\n";
    code += "      }\n";
    code += "    },\n";
    code += "    get_dir: async (lib, param) => {\n";
    code += "      try {\n";
    code += "        return get_dir(lib, param);\n";
    code += "      } catch (e) {\n";
    code += "        return file_error(e);\n";
    code += "      }\n";
    code += "    },\n";
    code += "    get_file_mtime: async (lib, param) => {\n";
    code += "      try {\n";
    code += "        return get_file_mtime(lib, param);\n";
    code += "      } catch (e) {\n";
    code += "        return file_error(e);\n";
    code += "      }\n";
    code += "    },\n";
    }
    code += "    get_time: async (lib, param) => {\n";
    code += "      return host_ok(String(Date.now()));\n";
    code += "    },\n";
    code += "    exit: async (lib, param) => {\n";
    code += "      var code = param === '' || param === undefined ? 0 : Number(param);\n";
    code += "      if (!(code >= 0)) code = 1;\n";
    code += "      lib.pc.exit(code);\n";
    code += "      return host_ok('');\n";
    code += "    },\n";
    if (hneed.http) {
    code += "    request: async (lib, param) => {\n";
    code += "      return request(lib, param);\n";
    code += "    },\n";
    }
    code += "    get_time: async (lib, param) => {\n";
    code += "      return String(Date.now());\n";
    code += "    },\n";
    code += "    get_line: async (lib, param) => {\n";
    code += "      return host_abortable(lib, function(finish) {\n";
    code += "        lib.rl.question(param, function(line) { finish(host_ok(line)); });\n";
    code += "      });\n";
    code += "    },\n";
    code += "    get_args: async (lib, param) => {\n";
    code += "      return host_get_args(lib);\n";
    code += "    },\n";
    code += "    get_env: async (lib, param) => {\n";
    code += "      try {\n";
    code += "        var name = String(param == null ? '' : param);\n";
    code += "        if (!name || name.indexOf('\\n') >= 0 || name.indexOf('=') >= 0) return '1\\nempty_name';\n";
    code += "        if (typeof process === 'undefined' || !process.env) return '1\\nmissing';\n";
    code += "        if (!Object.prototype.hasOwnProperty.call(process.env, name)) return '1\\nmissing';\n";
    code += "        return '0\\n' + String(process.env[name]);\n";
    code += "      } catch (e) { return '1\\n' + String(e && e.message || e); }\n";
    code += "    },\n";
    code += "    set_env: async (lib, param) => {\n";
    code += "      try {\n";
    code += "        var p = String(param == null ? '' : param);\n";
    code += "        var nl = p.indexOf('\\n');\n";
    code += "        var name = nl < 0 ? p : p.slice(0, nl);\n";
    code += "        var val = nl < 0 ? '' : p.slice(nl + 1);\n";
    code += "        if (!name || name.indexOf('=') >= 0) return '1\\nempty_name';\n";
    code += "        if (typeof process === 'undefined' || !process.env) return '1\\nmissing';\n";
    code += "        process.env[name] = val;\n";
    code += "        return '0\\n';\n";
    code += "      } catch (e) { return '1\\n' + String(e && e.message || e); }\n";
    code += "    },\n";
    code += "    del_env: async (lib, param) => {\n";
    code += "      try {\n";
    code += "        var name = String(param == null ? '' : param);\n";
    code += "        if (!name || name.indexOf('\\n') >= 0 || name.indexOf('=') >= 0) return '1\\nempty_name';\n";
    code += "        if (typeof process === 'undefined' || !process.env) return '1\\nmissing';\n";
    code += "        delete process.env[name];\n";
    code += "        return '0\\n';\n";
    code += "      } catch (e) { return '1\\n' + String(e && e.message || e); }\n";
    code += "    },\n";
    code += "    env_keys: async (lib, param) => {\n";
    code += "      try {\n";
    code += "        if (typeof process === 'undefined' || !process.env) return '0\\n';\n";
    code += "        var ks = Object.keys(process.env).filter(function(k) {\n";
    code += "          return k && k.indexOf('\\n') < 0 && k.indexOf('=') < 0;\n";
    code += "        });\n";
    code += "        return '0\\n' + ks.join('\\n');\n";
    code += "      } catch (e) { return '1\\n' + String(e && e.message || e); }\n";
    code += "    },\n";
    code += "    get_state: async (lib, param) => {\n";
    code += "      return host_ok(Object.prototype.hasOwnProperty.call(HOST_STATE, param) ? HOST_STATE[param] : '');\n";
    code += "    },\n";
    code += "    set_state: async (lib, param) => {\n";
    code += "      var nl = param.indexOf('\\n');\n";
    code += "      if (nl === -1) { HOST_STATE[param] = ''; }\n";
    code += "      else { HOST_STATE[param.slice(0, nl)] = param.slice(nl + 1); }\n";
    code += "      return host_ok('');\n";
    code += "    },\n";
    code += "    get_random: async (lib, param) => {\n";
    code += "      try {\n";
    code += "        return host_ok(String(require('crypto').randomBytes(8).readUInt32BE(0) / 4294967296));\n";
    code += "      } catch (e) {\n";
    code += "        throw new Error('secure random unavailable');\n";
    code += "      }\n";
    code += "    },\n";
    if (hneed.crypto) {
    code += "    sha256: async (lib, param) => {\n";
    code += "      return host_ok(require('crypto').createHash('sha256').update(param, 'utf8').digest('hex'));\n";
    code += "    },\n";
    code += "    sha256_ex: async (lib, param) => {\n";
    code += "      try {\n";
    code += "        return '0\\n' + require('crypto').createHash('sha256').update(param, 'utf8').digest('hex');\n";
    code += "      } catch (e) { return '1\\n' + String(e && e.message || e); }\n";
    code += "    },\n";
    code += "    hmac_sha256: async (lib, param) => {\n";
    code += "      try {\n";
    code += "        var nl = String(param).indexOf('\\n');\n";
    code += "        if (nl < 0) return '1\\nbad param';\n";
    code += "        var key = param.slice(0, nl);\n";
    code += "        var msg = param.slice(nl + 1);\n";
    code += "        return '0\\n' + require('crypto').createHmac('sha256', key).update(msg, 'utf8').digest('hex');\n";
    code += "      } catch (e) { return '1\\n' + String(e && e.message || e); }\n";
    code += "    },\n";
    }
    if (hneed.file) {
    code += "    file_hash: async (lib, param) => {\n";
    code += "      try {\n";
    code += "        var buf = lib.fs.readFileSync(param);\n";
    code += "        return host_ok(require('crypto').createHash('sha256').update(buf).digest('hex'));\n";
    code += "      } catch (e) {\n";
    code += "        return host_err((e && e.code === 'ENOENT') ? 'ENOENT' : String(e && e.message || e));\n";
    code += "      }\n";
    code += "    },\n";
    code += "    set_file2: async (lib, param) => {\n";
    code += "      try {\n";
    code += "        var nl = param.indexOf('\\n');\n";
    code += "        var fpath = nl === -1 ? param : param.slice(0, nl);\n";
    code += "        var data = nl === -1 ? '' : param.slice(nl + 1);\n";
    code += "        lib.fs.mkdirSync(fpath.split('/').slice(0, -1).join('/'), {recursive: true});\n";
    code += "        lib.fs.writeFileSync(fpath, data);\n";
    code += "        return host_ok('');\n";
    code += "      } catch (e) {\n";
    code += "        return file_error(e);\n";
    code += "      }\n";
    code += "    },\n";
    }
    code += "    cwd: async (lib, param) => {\n";
    code += "      try { return host_ok(process.cwd()); } catch (e) { return host_err(String(e && e.message || e)); }\n";
    code += "    },\n";
    if (hneed.file) {
    code += "    fs_read_ex: async (lib, param) => {\n";
    code += "      try { return '0\\n' + lib.fs.readFileSync(param, 'utf8'); }\n";
    code += "      catch (e) { return '1\\n' + ((e && e.code === 'ENOENT') ? 'ENOENT' : String(e && e.message || e)); }\n";
    code += "    },\n";
    code += "    fs_write_ex: async (lib, param) => {\n";
    code += "      try {\n";
    code += "        var nl = param.indexOf('\\n');\n";
    code += "        var fpath = nl === -1 ? param : param.slice(0, nl);\n";
    code += "        var data = nl === -1 ? '' : param.slice(nl + 1);\n";
    code += "        var dir = fpath.split('/').slice(0, -1).join('/');\n";
    code += "        if (dir) lib.fs.mkdirSync(dir, {recursive: true});\n";
    code += "        lib.fs.writeFileSync(fpath, data);\n";
    code += "        return '0\\n';\n";
    code += "      } catch (e) { return '1\\n' + String(e && e.message || e); }\n";
    code += "    },\n";
    code += "    fs_del_ex: async (lib, param) => {\n";
    code += "      try { lib.fs.unlinkSync(param); return '0\\n'; }\n";
    code += "      catch (e) { return '1\\n' + ((e && e.code === 'ENOENT') ? 'ENOENT' : String(e && e.message || e)); }\n";
    code += "    },\n";
    code += "    fs_open: async (lib, param) => {\n";
    code += "      try {\n";
    code += "        var fd = lib.fs.openSync(param, 'r');\n";
    code += "        var id = String(++HOST_FD_N);\n";
    code += "        HOST_FD[id] = {fd: fd, path: param};\n";
    code += "        HOST_RES.push({kind: 'fd', id: id});\n";
    code += "        return '0\\n' + id;\n";
    code += "      } catch (e) { return '1\\n' + ((e && e.code === 'ENOENT') ? 'ENOENT' : String(e && e.message || e)); }\n";
    code += "    },\n";
    code += "    fs_read_fd: async (lib, param) => {\n";
    code += "      try {\n";
    code += "        var rec = HOST_FD[param]; if (!rec) return '1\\nclosed';\n";
    code += "        var st = lib.fs.fstatSync(rec.fd);\n";
    code += "        var buf = Buffer.alloc(st.size);\n";
    code += "        lib.fs.readSync(rec.fd, buf, 0, buf.length, 0);\n";
    code += "        return '0\\n' + buf.toString('utf8');\n";
    code += "      } catch (e) { return '1\\n' + String(e && e.message || e); }\n";
    code += "    },\n";
    code += "    fs_close: async (lib, param) => {\n";
    code += "      try {\n";
    code += "        var rec = HOST_FD[param]; if (!rec) return '0\\n';\n";
    code += "        lib.fs.closeSync(rec.fd); delete HOST_FD[param];\n";
    code += "        HOST_RES = HOST_RES.filter(function(r) { return !(r.kind === 'fd' && r.id === param); });\n";
    code += "        return '0\\n';\n";
    code += "      } catch (e) { return '1\\n' + String(e && e.message || e); }\n";
    code += "    },\n";
    code += "    fs_temp_push: async (lib, param) => { HOST_RES.push({kind: 'temp', path: param}); return '0\\n'; },\n";
    code += "    fs_temp_pop: async (lib, param) => {\n";
    code += "      var path = param || '';\n";
    code += "      HOST_RES = HOST_RES.filter(function(r) {\n";
    code += "        if (r.kind === 'temp' && (!path || r.path === path)) {\n";
    code += "          try { if (r.path) lib.fs.unlinkSync(r.path); } catch (eP) {}\n";
    code += "          return false;\n";
    code += "        }\n";
    code += "        return true;\n";
    code += "      });\n";
    code += "      return '0\\n';\n";
    code += "    },\n";
    code += "    stream_open: async (lib, param) => {\n";
    code += "      try {\n";
    code += "        var fd = lib.fs.openSync(param, 'r');\n";
    code += "        var id = String(++HOST_STREAM_N);\n";
    code += "        HOST_STREAM[id] = {fd: fd, buf: '', done: false};\n";
    code += "        HOST_RES.push({kind: 'stream', id: id});\n";
    code += "        return '0\\n' + id;\n";
    code += "      } catch (e) { return '1\\n' + ((e && e.code === 'ENOENT') ? 'ENOENT' : String(e && e.message || e)); }\n";
    code += "    },\n";
    code += "    stream_read: async (lib, param) => {\n";
    code += "      var rec = HOST_STREAM[param]; if (!rec) return '1\\nclosed';\n";
    code += "      if (rec.done) return '0\\n';\n";
    code += "      var nl = rec.buf.indexOf('\\n');\n";
    code += "      if (nl >= 0) { var line = rec.buf.slice(0, nl); rec.buf = rec.buf.slice(nl + 1); return '0\\n' + line; }\n";
    code += "      var chunk = Buffer.alloc(4096);\n";
    code += "      var n = lib.fs.readSync(rec.fd, chunk, 0, 4096, null);\n";
    code += "      if (!n) { rec.done = true; var rest = rec.buf; rec.buf = ''; return rest ? ('0\\n' + rest) : '0\\n'; }\n";
    code += "      rec.buf += chunk.slice(0, n).toString('utf8');\n";
    code += "      nl = rec.buf.indexOf('\\n');\n";
    code += "      if (nl >= 0) { var line2 = rec.buf.slice(0, nl); rec.buf = rec.buf.slice(nl + 1); return '0\\n' + line2; }\n";
    code += "      return '0\\n' + rec.buf;\n";
    code += "    },\n";
    code += "    stream_close: async (lib, param) => {\n";
    code += "      var rec = HOST_STREAM[param]; if (!rec) return '0\\n';\n";
    code += "      try { lib.fs.closeSync(rec.fd); } catch (eC) {}\n";
    code += "      delete HOST_STREAM[param];\n";
    code += "      HOST_RES = HOST_RES.filter(function(r) { return !(r.kind === 'stream' && r.id === param); });\n";
    code += "      return '0\\n';\n";
    code += "    },\n";
    }
    if (hneed.http) {
    code += "    http: async (lib, param) => { return host_http(lib, param); },\n";
    }
    if (hneed.job) {
    code += "    job_start: async (lib, param) => host_job_start(lib, param),\n";
    code += "    job_await: async (lib, param) => { var j = HOST_JOBS[param]; return j ? await j.promise : '1\\nno job'; },\n";
    code += "    job_race: async (lib, param) => { var ids = param.split('\\n'); var a = HOST_JOBS[ids[0]], b = HOST_JOBS[ids[1]]; if (!a||!b) return '1'; return Promise.race([a.promise.then(()=> '0'), b.promise.then(()=> '1')]); },\n";
    code += "    job_cancel: async (lib, param) => { var j = HOST_JOBS[param]; if (j && j.ctrl && j.ctrl.cancel) j.ctrl.cancel(); return host_ok(''); },\n";
    }
    if (hneed.dns) {
    code += "    dns: async (lib, param) => {\n";
    code += "      try {\n";
    code += "        var host = String(param == null ? '' : param);\n";
    code += "        if (!host || host.indexOf('\\n') >= 0) return '1\\nempty_name';\n";
    code += "        var r = await require('dns').promises.lookup(host);\n";
    code += "        return '0\\n' + r.address;\n";
    code += "      } catch (e) { return '1\\n' + String(e && e.message || e); }\n";
    code += "    },\n";
    }
    if (hneed.tcp) {
    code += "    tcp_connect: async (lib, param) => host_tcp_connect(lib, param),\n";
    code += "    tcp_send: async (lib, param) => host_tcp_send(lib, param),\n";
    code += "    tcp_recv: async (lib, param) => host_tcp_recv(lib, param),\n";
    code += "    tcp_close: async (lib, param) => { var s = HOST_TCP[param]; if (s && s.sock) s.sock.destroy(); delete HOST_TCP[param]; return '0\\n'; },\n";
    }
    if (hneed.ws) {
    code += "    ws_connect: async (lib, param) => host_ws_connect(lib, param),\n";
    code += "    ws_send: async (lib, param) => { var nl = param.indexOf('\\n'); return host_tcp_send(lib, param); },\n";
    code += "    ws_recv: async (lib, param) => host_tcp_recv(lib, param),\n";
    code += "    ws_close: async (lib, param) => {\n";
    code += "      var rec = (typeof HOST_TCP !== 'undefined') ? HOST_TCP[param] : null;\n";
    code += "      if (rec && rec.ws) {\n";
    code += "        try { rec.sock.write(Buffer.from([0x88, 0x80, 0, 0, 0, 0])); } catch (eC) {}\n";
    code += "        try { rec.sock.end(); } catch (eE) {}\n";
    code += "        delete HOST_TCP[param];\n";
    code += "      }\n";
    code += "      HOST_RES = HOST_RES.filter(function(r) { return !(r.kind === 'ws' && r.id === param); });\n";
    code += "      return '0\\n';\n";
    code += "    },\n";
    }
    if (hneed.zlib) {
    code += "    gzip: async (lib, param) => { try { return '0\\n' + require('zlib').gzipSync(Buffer.from(param, 'utf8')).toString('hex'); } catch (e) { return '1\\n' + String(e && e.message || e); } },\n";
    code += "    gunzip: async (lib, param) => { try { return '0\\n' + require('zlib').gunzipSync(Buffer.from(param, 'hex')).toString('utf8'); } catch (e) { return '1\\n' + String(e && e.message || e); } },\n";
    }
    if (hneed.server) {
    code += "    http_listen: async (lib, param) => host_http_listen(lib, param),\n";
    code += "    http_recv: async (lib, param) => host_http_recv(lib, param),\n";
    code += "    http_reply: async (lib, param) => host_http_reply(lib, param),\n";
    code += "    http_reply_ex: async (lib, param) => host_http_reply_ex(lib, param),\n";
    code += "    http_stop: async (lib, param) => host_http_stop(lib, param),\n";
    code += "    http_reply_hdr: async (lib, param) => host_http_reply_hdr(lib, param),\n";
    }
    if (hneed.sse) {
    code += "    sse_open: async (lib, param) => host_sse_open(lib, param),\n";
    code += "    sse_send: async (lib, param) => host_sse_send(lib, param),\n";
    code += "    sse_close: async (lib, param) => host_sse_close(lib, param),\n";
    code += "    sse_count: async (lib, param) => host_sse_count(lib, param),\n";
    }
    code += "    yield: async (lib, param) => { await Promise.resolve(); return host_ok(''); },\n";
    if (hneed.ffi) {
    code += "    ffi: async (lib, param) => host_ffi(lib, param),\n";
    }
    if (hneed.worker) {
    code += "    worker_run: async (lib, param) => host_worker_run(lib, param),\n";
    }
    if (hneed.job) {
    code += "    job_all: async (lib, param) => {\n";
    code += "      var ids = String(param || '').split('\\n').filter(function(x) { return x.length; });\n";
    code += "      var ps = ids.map(function(id) { return HOST_JOBS[id] ? HOST_JOBS[id].promise : Promise.resolve('1\\nno job'); });\n";
    code += "      await Promise.all(ps); return '0\\n';\n";
    code += "    },\n";
    }
    if (hneed.proc) {
    code += "    proc_exec: async (lib, param) => host_proc_exec(lib, param),\n";
    code += "    proc_unsafe_shell: async (lib, param) => host_proc_unsafe_shell(lib, param),\n";
    code += "    proc_run: async (lib, param) => host_proc_run(lib, param),\n";
    code += "    proc_spawn: async (lib, param) => host_proc_spawn(lib, param),\n";
    code += "    proc_spawn_ex: async (lib, param) => host_proc_spawn_ex(lib, param),\n";
    code += "    proc_kill: async (lib, param) => host_proc_kill(lib, param),\n";
    code += "    proc_wait: async (lib, param) => host_proc_wait(lib, param),\n";
    }
    if (hneed.file) {
    code += "    fs_read_hex: async (lib, param) => {\n";
    code += "      try { return '0\\n' + Buffer.from(lib.fs.readFileSync(param)).toString('hex'); }\n";
    code += "      catch (e) { return '1\\n' + ((e && e.code === 'ENOENT') ? 'ENOENT' : String(e && e.message || e)); }\n";
    code += "    },\n";
    code += "    fs_write_hex: async (lib, param) => {\n";
    code += "      try {\n";
    code += "        var nl = param.indexOf('\\n'); var fpath = nl === -1 ? param : param.slice(0, nl); var hex = nl === -1 ? '' : param.slice(nl + 1);\n";
    code += "        var dir = fpath.split('/').slice(0, -1).join('/');\n";
    code += "        if (dir) lib.fs.mkdirSync(dir, {recursive: true});\n";
    code += "        lib.fs.writeFileSync(fpath, Buffer.from(hex, 'hex'));\n";
    code += "        return '0\\n';\n";
    code += "      } catch (e) { return '1\\n' + String(e && e.message || e); }\n";
    code += "    },\n";
    code += "    get_dir_ex: async (lib, param) => {\n";
    code += "      try { return '0\\n' + lib.fs.readdirSync(param).join(';'); }\n";
    code += "      catch (e) { return '1\\n' + ((e && e.code === 'ENOENT') ? 'ENOENT' : String(e && e.message || e)); }\n";
    code += "    },\n";
    }
    if (hneed.db) {
    code += "    db_connect: async (lib, param) => host_db_connect(lib, param),\n";
    code += "    db_get: async (lib, param) => host_db_get(lib, param),\n";
    code += "    db_set: async (lib, param) => host_db_set(lib, param),\n";
    code += "    db_del: async (lib, param) => host_db_del(lib, param),\n";
    code += "    db_has: async (lib, param) => host_db_has(lib, param),\n";
    code += "    db_keys: async (lib, param) => host_db_keys(lib, param),\n";
    code += "    db_clear: async (lib, param) => host_db_clear(lib, param),\n";
    code += "    db_query: async (lib, param) => host_db_query(lib, param),\n";
    code += "    db_close: async (lib, param) => host_db_close(lib, param),\n";
    }
    if (hneed.udp) {
    code += "    init_udp: async (lib, param) => {\n";
    code += "      try {\n";
    code += "        await init_udp(lib, Number(param));\n";
    code += "        return host_ok('');\n";
    code += "      } catch (e) {\n";
    code += "        return host_err(String(e && e.message || e));\n";
    code += "      }\n";
    code += "    },\n";
    code += "    send_udp: async (lib, param) => {\n";
    code += "      let [port_num, to_ip, to_port_num, data] = param.split(';');\n";
    code += "      await send_udp(lib, Number(port_num), to_ip, Number(to_port_num), data);\n";
    code += "      return host_ok('');\n";
    code += "    },\n";
    code += "    recv_udp: async (lib, param) => {\n";
    code += "      var mailbox = await recv_udp(lib, Number(param));\n";
    code += "      var reply = mailbox.map(x => x.ip + ',' + x.port + ',' + x.data).join(';');\n";
    code += "      return host_ok(reply);\n";
    code += "    },\n";
    code += "    stop_udp: async (lib, param) => {\n";
    code += "      await stop_udp(lib, Number(param));\n";
    code += "      return host_ok('');\n";
    code += "    },\n";
    code += "    udp_bind: async (lib, param) => {\n";
    code += "      try {\n";
    code += "        var n = Number(param);\n";
    code += "        if (!lib.dg) return '1\\nbad host';\n";
    code += "        if (!Number.isFinite(n) || n < 0 || n > 65535) return '1\\nbad port';\n";
    code += "        await init_udp(lib, n);\n";
    code += "        return '0\\n';\n";
    code += "      } catch (e) { return '1\\n' + String(e && e.message || e); }\n";
    code += "    },\n";
    code += "    udp_send: async (lib, param) => {\n";
    code += "      try {\n";
    code += "        var parts = String(param).split('\\n');\n";
    code += "        if (parts.length < 3) return '1\\nbad param';\n";
    code += "        var from = Number(parts[0]); var ip = parts[1] || ''; var to = Number(parts[2]); var data = parts.slice(3).join('\\n');\n";
    code += "        if (!ip) return '1\\nbad dest';\n";
    code += "        if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || from > 65535 || to < 0 || to > 65535) return '1\\nbad port';\n";
    code += "        if (!PORTS[from]) return '1\\nclosed';\n";
    code += "        await send_udp(lib, from, ip, to, data);\n";
    code += "        return '0\\n';\n";
    code += "      } catch (e) { return '1\\n' + String(e && e.message || e); }\n";
    code += "    },\n";
    code += "    udp_recv: async (lib, param) => {\n";
    code += "      try {\n";
    code += "        var n = Number(param);\n";
    code += "        if (!Number.isFinite(n) || n < 0 || n > 65535) return '1\\nbad port';\n";
    code += "        if (!PORTS[n]) return '1\\nclosed';\n";
    code += "        var mailbox = await recv_udp(lib, n);\n";
    code += "        return '0\\n' + mailbox.map(x => x.ip + ',' + x.port + ',' + x.data).join(';');\n";
    code += "      } catch (e) { return '1\\n' + String(e && e.message || e); }\n";
    code += "    },\n";
    code += "    udp_close: async (lib, param) => {\n";
    code += "      try { await stop_udp(lib, Number(param)); return '0\\n'; }\n";
    code += "      catch (e) { return '1\\n' + String(e && e.message || e); }\n";
    code += "    },\n";
    }
    code += "    sleep: async (lib, param) => {\n";
    code += "      var ac = lib && lib.abort;\n";
    code += "      return await new Promise((resolve) => {\n";
    code += "        var ms = Number(param);\n";
    code += "        var t = setTimeout(function() { resolve(host_ok('')); }, Number.isFinite(ms) ? ms : 0);\n";
    code += "        var onAbort = function() { clearTimeout(t); resolve(host_err('cancelled')); };\n";
    code += "        if (ac && ac.signal) {\n";
    code += "          if (ac.signal.aborted) { onAbort(); return; }\n";
    code += "          ac.signal.addEventListener('abort', onAbort, {once: true});\n";
    code += "        }\n";
    code += "      });\n";
    code += "    },\n";
    code += "  };\n";
    code += "  var run_io = async (lib, io, depth, ac) => {\n";
    code += "    ac = ac || lib.abort || new AbortController();\n";
    code += "    lib.abort = ac;\n";
    code += "    try {\n";
    code += "    if (ac.signal && ac.signal.aborted) throw new Error('cancelled');\n";
    code += "    if (!io || !io._) throw new Error('empty IO');\n";
    code += "    switch (io._) {\n";
    code += "      case 'IO.end':\n";
    code += "        return Promise.resolve(io.value);\n";
    code += "      case 'IO.ask':\n";
    code += "        var action = io_action[io.query];\n";
    code += "        var answer;\n";
    code += "        try {\n";
    code += "          answer = action ? await action(lib, io.param) : '1\\nno action';\n";
    code += "        } catch (e) {\n";
    code += "          answer = '1\\n' + String(e && e.message || e);\n";
    code += "        }\n";
    code += "        if (answer == null) answer = '';\n";
    code += "        try {\n";
    code += "          var _sd = (typeof process !== 'undefined' && process.env && process.env.SURE_DEBUG) ? String(process.env.SURE_DEBUG) : '';\n";
    code += "          var _so = (typeof process !== 'undefined' && process.env && process.env.SURE_DEBUG_OPT) ? String(process.env.SURE_DEBUG_OPT) : '';\n";
    code += "          var _xs = String(_so).split(/[,\\s]+/).filter(Boolean);\n";
    code += "          var _all = _xs.indexOf('all') >= 0;\n";
    code += "          var _fh = _all || _xs.indexOf('host') >= 0;\n";
    code += "          var _any = _fh || _xs.indexOf('term') >= 0 || _xs.indexOf('holes') >= 0 || _xs.indexOf('qc') >= 0;\n";
    code += "          var _open = !_any || _fh;\n";
    code += "          var _q = String(io.query || '');\n";
    code += "          var _ask = false;\n";
    code += "          if (_open) {\n";
    code += "            if (_q === 'yield') _ask = _sd === 'trace';\n";
    code += "            else _ask = _sd === 'info' || _sd === 'trace' || _fh;\n";
    code += "          }\n";
    code += "          if (_ask) {\n";
    code += "            function _redact(s) {\n";
    code += "              s = String(s == null ? '' : s);\n";
    code += "              var nli = s.indexOf('\\n');\n";
    code += "              var line = nli < 0 ? s : s.slice(0, nli);\n";
    code += "              if (line.length > 80) return line.slice(0, 80) + '...';\n";
    code += "              if (line.length < s.length) return line + '...';\n";
    code += "              return line;\n";
    code += "            }\n";
    code += "            var _p = _redact(io.param == null ? '' : io.param);\n";
    code += "            var _a = _redact(answer);\n";
    code += "            console.error('sure debug ' + (_q ? ('host ' + _q + ' ' + _p + ' -> ' + _a) : ('host ? ' + _p + ' -> ' + _a)));\n";
    code += "          }\n";
    code += "        } catch (_de) {}\n";
    code += "        if (typeof io.then !== 'function') throw new Error('IO.ask missing then');\n";
    code += "        if (ac.signal && ac.signal.aborted) throw new Error('cancelled');\n";
    code += "        if (depth > 64) return Promise.resolve().then(() => run_io(lib, io.then(answer), 0, ac));\n";
    code += "        return await run_io(lib, io.then(answer), depth + 1, ac);\n";
    code += "      case 'IO.par':\n";
    code += "        try {\n";
    code += "          var cL = new AbortController(); var cR = new AbortController();\n";
    code += "          if (ac.signal) ac.signal.addEventListener('abort', function() { cL.abort(); cR.abort(); });\n";
    code += "          var both = await Promise.all([run_io(Object.assign({}, lib, {abort: cL}), io.left, 0, cL), run_io(Object.assign({}, lib, {abort: cR}), io.right, 0, cR)]);\n";
    code += "          if (typeof io.join !== 'function') throw new Error('IO.par missing join');\n";
    code += "          return await run_io(lib, io.join({_: 'Pair.new', fst: both[0], snd: both[1]}), 0, ac);\n";
    code += "        } catch (e) {\n";
    code += "          host_release_all(lib); throw e;\n";
    code += "        }\n";
    code += "      case 'IO.race':\n";
    code += "        try {\n";
    code += "          var rL = new AbortController(); var rR = new AbortController();\n";
    code += "          if (ac.signal) ac.signal.addEventListener('abort', function() { rL.abort(); rR.abort(); });\n";
    code += "          var settle = function(p, side) {\n";
    code += "            return p.then(function(v) { return {side: side, value: v}; }, function(e) { return {side: side, error: e}; });\n";
    code += "          };\n";
    code += "          var pL = settle(run_io(Object.assign({}, lib, {abort: rL}), io.left, 0, rL), 0);\n";
    code += "          var pR = settle(run_io(Object.assign({}, lib, {abort: rR}), io.right, 0, rR), 1);\n";
    code += "          var winner = await Promise.race([pL, pR]);\n";
    code += "          if (winner.side === 0) rR.abort(); else rL.abort();\n";
    code += "          await (winner.side === 0 ? pR : pL);\n";
    code += "          if (winner.error) throw winner.error;\n";
    code += "          if (typeof io.join !== 'function') throw new Error('IO.race missing join');\n";
    code += "          var boxed = winner.side === 0\n";
    code += "            ? {_:'Either.left', value: winner.value}\n";
    code += "            : {_:'Either.right', value: winner.value};\n";
    code += "          return await run_io(lib, io.join(boxed), 0, ac);\n";
    code += "        } catch (e) {\n";
    code += "          host_release_all(lib); throw e;\n";
    code += "        }\n";
    code += "      case 'IO.bracket':\n";
    code += "        if (typeof io.use !== 'function' || typeof io.release !== 'function') throw new Error('IO.bracket missing use/release');\n";
    code += "        var resource = await run_io(lib, io.acquire, 0, ac);\n";
    code += "        var useErr = null; var useVal;\n";
    code += "        try {\n";
    code += "          useVal = await run_io(lib, io.use(resource), 0, ac);\n";
    code += "        } catch (eUse) { useErr = eUse; }\n";
    code += "        var relAc = new AbortController();\n";
    code += "        var relLib = Object.assign({}, lib, {abort: relAc});\n";
    code += "        try {\n";
    code += "          await run_io(relLib, io.release(resource), 0, relAc);\n";
    code += "        } catch (eRel) {\n";
    code += "          if (!useErr) useErr = eRel;\n";
    code += "        }\n";
    code += "        if (useErr) throw useErr;\n";
    code += "        return useVal;\n";
    code += "      default:\n";
    code += "        throw new Error('unknown IO ctor ' + (io && io._));\n";
    code += "      }\n";
    code += "    } catch (e) {\n";
    code += "      host_release_all(lib); throw e;\n";
    code += "    }\n";
    code += "  };\n";
  }

  // Arity analysis
  ARITY_OF = {};
  for (var name of nams) {
    if (cmps[name]) {
      var arity = 0;
      var expr = cmps[name];
      while (expr.ctor === "Lam") {
        arity += 1;
        expr = expr.body;
      }
      ARITY_OF[name] = arity;
    }
  }

  // Builds each top-level definition
  var export_names = [];
  for (var name of nams) {
    // Don't compile primitive types
    if (used_prim_types[name]) {
      continue;
    };
    // Generate JS expression
    var expr = null;
    if (used_prim_funcs[name]) {
      code += "  const "+js_name(name)+" = "+application(Ref(name), null, true)+";\n";
    } else {
      try {
        var comp = cmps[name];
        var type = defs[name].type;
        if (fmc.equal(type, fmc.Typ(), defs)) {
          continue;
        } else {
          var expr = js_code(comp, null, name);
          if (expr.slice(0,9) === "function ") {
            code += "  "+expr+";\n";
            var vars = [];
            var func = comp;
            while (func.ctor === "Lam") {
              vars.push("x"+vars.length);
              func = func.body;
            }
            code += "  const "+js_name(name)+" = "
            code += vars.map(x=>x+"=>").join("");
            code += js_name(name)+"$("+vars.join(",")+");\n";
          } else {
            code += "  const "+js_name(name)+" = "+expr+";\n";
          }
        }
      } catch (e) {
        console.log(e);
        process.exit();
        expr = "'ERROR'";
      };
    };
    export_names.push(name);
  };

  // Builds export list
  code += "  return {\n";
  if (isio) {
    code += "    '$main$': ()=>run("+js_name(main)+"),\n";
    code += "    'run': run,\n";
  };
  for (var name of export_names) {
    code += "    '"+name+"': "+js_name(name)+",\n";
  };
  code += "  };\n";
  code += "})();";

  // Builds last line to call exported main
  if (!opts.module && !opts.expression) {
    if (isio) {
      code += "\nmodule.exports['$main$']();";
    } else {
      code += "\nvar MAIN=module.exports['"+main+"']; try { console.log(JSON.stringify(MAIN,null,2) || '<unprintable>') } catch (e) { console.log(MAIN); };";
    };
  };

  return code;
};

function compile(code, name, opts) {
  return compile_defs(fmc.parse_defs(code), name, opts);
};

module.exports = {compile, compile_defs, shake_defs, shake_code};
