# mosaic-examples

Database-backed plots built with Mosaic, vgplot, and a fully local DuckDB-WASM bundle. The primary output is three background-transparent PNGs; the browser views are an optional interactive companion.

```bash
npm install
npm run build
npm run render   # out/*-transparent.png
npm test         # plus offline and pointer-interaction checks
```

Scenes cover a million-point density raster, dense multiseries signals, and SQL-linked brushing. All data is deterministic and synthetic. Runtime external requests are blocked by the validator.

## Transparent PNG gallery

| Million-point density | Dense signals | Linked views |
|---|---|---|
| ![Million-point density](out/density-transparent.png) | ![Dense temporal signals](out/signals-transparent.png) | ![SQL-linked views](out/linked-transparent.png) |
