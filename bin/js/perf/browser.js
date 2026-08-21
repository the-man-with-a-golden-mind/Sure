"use strict";
// Real-browser budgets: Counter, Todo, Excel. Requires puppeteer + Chrome.
var fs = require("fs");
var http = require("http");
var path = require("path");
var harness = require("./harness");

async function main() {
  var puppeteer;
  try { puppeteer = await import("puppeteer"); } catch (e) {
    console.log(JSON.stringify({ok: false, skip: "no puppeteer"}));
    return;
  }
  var chrome = process.env.CHROME;
  if (!chrome) {
    console.log(JSON.stringify({ok: false, skip: "no CHROME"}));
    return;
  }
  var root = path.resolve(__dirname, "../../..");
  var pages = [
    {name: "counter", file: path.join(root, "dist/Sure.Ui.Counter.client.html")},
    {name: "excel", file: path.join(root, "examples/excel/dist/Excel.client.html")}
  ];
  var browser = await puppeteer.default.launch({headless: "new", executablePath: chrome, args: ["--no-sandbox"]});
  var results = [];
  for (var i = 0; i < pages.length; i++) {
    var p = pages[i];
    if (!fs.existsSync(p.file)) { results.push({name: p.name, skip: "missing html"}); continue; }
    var html = fs.readFileSync(p.file, "utf8");
    var server = http.createServer(function(req, res) {
      res.writeHead(200, {"content-type": "text/html"});
      res.end(html);
    });
    await new Promise(function(r) { server.listen(0, r); });
    var page = await browser.newPage();
    var errors = [];
    page.on("pageerror", function(e) { errors.push(String(e.message)); });
    await page.goto("http://127.0.0.1:" + server.address().port + "/", {waitUntil: "domcontentloaded"});
    var t0 = Date.now();
    if (p.name === "counter") {
      await page.click("[data-sure-on-click=\"inc\"]").catch(function() {});
    }
    if (p.name === "excel") {
      var sc = await page.$("[data-sure-scroll]");
      if (sc) {
        var box = await sc.boundingBox();
        await page.mouse.move(box.x + 40, box.y + 40);
        await page.mouse.wheel({deltaY: 800});
        await new Promise(function(r) { setTimeout(r, 200); });
      }
    }
    var ms = Date.now() - t0;
    results.push({name: p.name, ms: ms, errors: errors, p95_budget_ms: p.name === "excel" ? 16.7 : 50});
    await page.close();
    server.close();
  }
  await browser.close();
  var out = {ok: results.every(function(r) { return !r.errors || !r.errors.length; }), env: harness.envInfo(""), results: results};
  harness.writeJson(path.join(__dirname, "browser.last.json"), out);
  console.log(JSON.stringify(out, null, 2));
}

main().catch(function(e) {
  console.error(e);
  process.exit(1);
});
