"use strict";
// HTML/JS emit helpers. No checker.
function sure_emit_safe(term) {
  var t = String(term || "");
  if (!t) return false;
  if (t.indexOf("/") >= 0 || t.indexOf("\\") >= 0 || t.indexOf("..") >= 0) return false;
  if (!/^[A-Za-z][A-Za-z0-9._]*$/.test(t)) return false;
  return true;
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

function sure_dom_mount_src() {
  return "var SureDom={mount:function(app){"
    + "if(!app||typeof document==='undefined'||!document)return;"
    + "var root=null;try{root=document.getElementById?document.getElementById('sure-root'):null;}catch(_i){root=null;}"
    + "if(!root){try{if(!document.createElement)return;root=document.createElement('div');root.id='sure-root';if(!document.body||!document.body.appendChild)return;document.body.appendChild(root);}catch(_r){return;}}"
    + "if(!root)return;"
    + "if(root.__sureMounted)return;root.__sureMounted=1;"
    + "var ev=" + JSON.stringify(SURE_DOM_EVENTS) + ";"
    + "function targetOf(e){var t=e.target;while(t&&t!==document&&!(t.getAttribute&&t.getAttribute('data-sure-on-'+e.type)!=null)){t=t.parentElement;}return t;}"
    + "function wireOf(e,msg,t){if(e.type==='submit'||e.type==='mousedown')try{e.preventDefault();}catch(_p){}var val=t.value==null?'':String(t.value);if(e.type==='scroll'){try{val=String((t.scrollTop|0)||0);}catch(_s){val='0';}}return [e.type,msg,t.id||'',val,e.key||'',e.button||0,(e.clientX|0)||0,(e.clientY|0)||0,e.altKey?1:0,e.ctrlKey?1:0,e.metaKey?1:0,e.shiftKey?1:0,t.checked?1:0].join('\\n');}"
    + applyPx.toString()
    + "function keepScroll(fn){var saved=[];try{var xs=root.querySelectorAll?root.querySelectorAll('[data-sure-scroll]'):[];for(var i=0;i<xs.length;i++)saved.push({k:(xs[i].getAttribute&&xs[i].getAttribute('data-sure-scroll'))||String(i),t:xs[i].scrollTop||0,l:xs[i].scrollLeft||0});}catch(_k){}try{fn();}catch(_d){}applyPx(root);try{if(typeof tailwind!=='undefined'&&tailwind.refresh)tailwind.refresh();}catch(_t){}try{var ys=root.querySelectorAll?root.querySelectorAll('[data-sure-scroll]'):[];for(var j=0;j<ys.length;j++){var k=(ys[j].getAttribute&&ys[j].getAttribute('data-sure-scroll'))||String(j);for(var s=0;s<saved.length;s++){if(saved[s].k===k){ys[j].scrollTop=saved[s].t;ys[j].scrollLeft=saved[s].l;break;}}}}catch(_r){}}"
    + "if(app._==='Html.Client.new'){"
    + "var model=app.init;"
    + "function draw(){keepScroll(function(){root.innerHTML=app.draw(model);});}"
    + "function onEv(e){try{var t=targetOf(e);if(!t||!t.getAttribute)return;var msg=t.getAttribute('data-sure-on-'+e.type);if(msg==null)return;model=app.step(wireOf(e,msg,t))(model);draw();}catch(_e){}}"
    + "for(var i=0;i<ev.length;i++)document.addEventListener(ev[i],onEv,true);"
    + "draw();return;}"
    + "if(app._!=='Sure.Ui.Client.new')return;"
    + "var model=app.init;var bags=[];var lastSub=null;var depth=0;"
    + "function pairOf(p){if(p&&p._==='Pair.new')return p;return {_:'Pair.new',fst:p,snd:''};}"
    + "function draw(){keepScroll(function(){root.innerHTML=app.draw(model);});}"
    + "function applySub(text){text=String(text==null?'':text);if(text===lastSub)return;lastSub=text;"
    + "for(var i=0;i<bags.length;i++){try{if(bags[i].t)clearInterval(bags[i].t);if(bags[i].es)bags[i].es.close();}catch(_c){}}bags=[];"
    + "if(!text)return;var parts=text.split('\\n.\\n');"
    + "for(var i=0;i<parts.length;i++){var lines=parts[i].split('\\n');var k=lines[0]||'';"
    + "if(k==='E'){var ms=Number(lines[1])||0;var msg=lines[2]||'';if(ms>0){var t=setInterval((function(m){return function(){go('every',m,'');};})(msg),ms);bags.push({t:t});}}"
    + "else if(k==='S'){var path=lines[1]||'';var msg=lines[2]||'';if(path){try{var es=new EventSource(path);es.onmessage=(function(m){return function(ev){go('sse',m,ev&&ev.data?String(ev.data):'');};})(msg);es.onerror=function(){};bags.push({es:es});}catch(_s){}}}}}"
    + "function runCmd(text){if(!text)return;var parts=String(text).split('\\n.\\n');"
    + "for(var i=0;i<parts.length;i++){var lines=parts[i].split('\\n');var k=lines[0]||'';"
    + "try{if(k==='H'){var url=lines[1]||'';var msg=lines.slice(2).join('\\n');if(url){fetch(url,{credentials:'same-origin'}).then(function(r){return r.text();}).then((function(m){return function(body){go('http',m,String(body==null?'':body));};})(msg)).catch((function(m){return function(){go('http',m,'');};})(msg));}}"
    + "else if(k==='O'){var url=lines[1]||'';var msg=lines[2]||'';var body=lines.slice(3).join('\\n');if(url){fetch(url,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'text/plain; charset=utf-8'},body:body}).then(function(r){return r.text();}).then((function(m){return function(b){go('http',m,String(b==null?'':b));};})(msg)).catch((function(m){return function(){go('http',m,'');};})(msg));}}"
    + "else if(k==='T'){var ms=Number(lines[1])||0;var msg=lines.slice(2).join('\\n');if(ms>0)setTimeout((function(m){return function(){go('tick',m,'');};})(msg),ms);}"
    + "else if(k==='P'){go('push',lines.slice(1).join('\\n'),'');}}catch(_f){}}}"
    + "function go(kind,msg,value){if(depth>32)return;depth++;try{"
    + "var raw=[kind,msg,'',value,'',0,0,0,0,0,0,0,0].join('\\n');"
    + "var p=pairOf(app.step(raw)(model));model=p.fst;draw();runCmd(p.snd||'');applySub(app.listen(model));"
    + "}catch(_g){}depth--;}"
    + "function onEv(e){try{var t=targetOf(e);if(!t||!t.getAttribute)return;var msg=t.getAttribute('data-sure-on-'+e.type);if(msg==null)return;"
    + "if((e.type==='change'||e.type==='input')&&t.files&&t.files[0]){var f=t.files[0];if(!f||!f.size){go('change',msg,'');return;}try{var fr=new FileReader();fr.onload=function(){go('change',msg,String(fr.result||''));};fr.onerror=function(){go('change',msg,'');};fr.readAsDataURL(f);}catch(_r){go('change',msg,'');}return;}"
    + "var p=pairOf(app.step(wireOf(e,msg,t))(model));model=p.fst;draw();runCmd(p.snd||'');applySub(app.listen(model));}catch(_e){}}"
    + "for(var i=0;i<ev.length;i++)document.addEventListener(ev[i],onEv,true);"
    + "draw();try{runCmd(app.boot||'');applySub(app.listen(model));}catch(_b){}"
    + "}};";
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

function sure_html_cdn() {
  return "<script src=\"https://cdn.tailwindcss.com\"></script>"
    + "<link href=\"https://cdn.jsdelivr.net/npm/daisyui@4.12.23/dist/full.min.css\" rel=\"stylesheet\" type=\"text/css\">";
}

function sure_html_wrap(term, js) {
  if (!sure_emit_safe(term) || !js) return "";
  var title = String(term).replace(/[^A-Za-z0-9._-]/g, "") || "Sure";
  return "<!DOCTYPE html><html data-theme=\"light\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>" + title
    + "</title>" + sure_html_cdn() + "<style>" + sure_html_css() + "</style>"
    + "</head><body class=\"bg-base-200\"><div id=\"sure-root\"></div><script>\n"
    + "var module={exports:{}};\n" + js + "\n" + sure_dom_mount_src() + "\n"
    + "SureDom.mount(module.exports[" + JSON.stringify(term) + "]||module.exports);\n"
    + "</script></body></html>\n";
}

module.exports = {
    sure_emit_safe: sure_emit_safe,
    sure_emit_file: sure_emit_file,
    sure_emit_html_file: sure_emit_html_file,
    SURE_DOM_EVENTS: SURE_DOM_EVENTS,
    sure_dom_mount_src: sure_dom_mount_src,
    sure_html_css: sure_html_css,
    sure_html_cdn: sure_html_cdn,
    sure_html_wrap: sure_html_wrap,
    applyPx: applyPx
};
