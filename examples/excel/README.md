# sure/excel

Spreadsheet on `127.0.0.1:8765`. 10000 rows in the scroller, ~30 DOM rows in the window. Edit a cell and leave it (change/blur) to keep the value. Drag a column edge to resize; widths write to `excel-cols.txt`.

```bash
sure prove
sure build --html Excel.client
sure run
# open http://127.0.0.1:8765/          # scroll + resize
curl http://127.0.0.1:8765/sheet/state
curl 'http://127.0.0.1:8765/sheet/save?w=80,80,80,80,80,80,80,80'
```

`sure run` without `dist/Excel.client.html` serves a page that tells you to build. Scroll and resize need that file.

`sure run` compiles `Main` the first time (no `dist/Main.js`) and prints `compile Main …`. After listen it stays quiet: open http://127.0.0.1:8765/ — it is a grid, not a vertical dump of cell names.
