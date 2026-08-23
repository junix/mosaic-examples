import * as duckdb from '@duckdb/duckdb-wasm';
import {Coordinator, DuckDBWASMConnector, createAPIContext} from '@uwdata/vgplot';
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import './style.css';

type SceneName = 'density' | 'signals' | 'linked';

const scenes: Record<SceneName, {title: string; subtitle: string; rows: number}> = {
  density: {
    title: 'A million points, queried as pixels',
    subtitle: 'DuckDB-WASM bins a deterministic point cloud; Mosaic asks only for the screen-level density needed by the plot.',
    rows: 1_000_000
  },
  signals: {
    title: 'Dense temporal signal atlas',
    subtitle: 'Four long time series are compressed into a legible overview with database-backed aggregation and pan/zoom.',
    rows: 400_000
  },
  linked: {
    title: 'Linked operational rhythms',
    subtitle: 'Brush the scatter field to filter the hourly profile; both views are coordinated through a shared SQL selection.',
    rows: 320_000
  }
};

const params = new URLSearchParams(location.search);
const requested = params.get('scene');
const scene: SceneName = requested && requested in scenes ? requested as SceneName : 'density';
const exportMode = params.get('export') === '1';
const meta = scenes[scene];
const runtime: NonNullable<Window['__mosaicDemo']> = window.__mosaicDemo = {ready: false, scene, rows: meta.rows, interactions: 0};

document.querySelector<HTMLElement>('#app')!.innerHTML = `
  <section class="shell ${exportMode ? 'export' : ''}">
    <header class="header">
      <div>
        <div class="kicker">Mosaic · DuckDB-WASM · vgplot</div>
        <h1>${meta.title}</h1>
        <p class="subtitle">${meta.subtitle}</p>
        <nav class="nav">
          ${Object.keys(scenes).map(key => `<a class="${key === scene ? 'active' : ''}" href="?scene=${key}">${key}</a>`).join('')}
        </nav>
      </div>
      <div class="badge">${meta.rows.toLocaleString()} LOCAL ROWS</div>
    </header>
    <section class="figure">
      <div class="chart" id="chart"><div class="loading">Starting local analytical engine…</div></div>
      <div class="status" id="status">initializing</div>
    </section>
  </section>`;

async function localDatabase(): Promise<duckdb.AsyncDuckDB> {
  const bundles: duckdb.DuckDBBundles = {
    mvp: {mainModule: mvpWasm, mainWorker: mvpWorker},
    eh: {mainModule: ehWasm, mainWorker: ehWorker}
  };
  const bundle = await duckdb.selectBundle(bundles);
  if (!bundle.mainWorker) throw new Error('DuckDB-WASM worker bundle unavailable');
  const worker = new Worker(bundle.mainWorker);
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  return db;
}

async function build(): Promise<void> {
  const database = await localDatabase();
  const connector = new DuckDBWASMConnector({duckdb: database});
  const coordinator = new Coordinator(connector, {cache: true, consolidate: true});
  const vg: any = createAPIContext({coordinator});
  const chart = document.querySelector<HTMLElement>('#chart')!;
  const status = document.querySelector<HTMLElement>('#status')!;
  status.textContent = 'building local table';

  if (scene === 'density') {
    await coordinator.exec(`
      CREATE TABLE points AS
      SELECT
        i,
        43 * sin(i * 0.017) + 19 * sin(i * 0.00031) + ((i % 97) / 97.0 - 0.5) * 13 AS x,
        31 * cos(i * 0.013) + 16 * sin(i * 0.00047) + ((i % 61) / 61.0 - 0.5) * 11 AS y,
        CASE WHEN i % 4 = 0 THEN 'north' WHEN i % 4 = 1 THEN 'east' WHEN i % 4 = 2 THEN 'south' ELSE 'west' END AS cohort
      FROM range(${meta.rows}) AS t(i)
    `);
    chart.replaceChildren(vg.plot(
      vg.heatmap(vg.from('points'), {x: 'x', y: 'y', bandwidth: 10, pixelSize: 1}),
      vg.intervalXY({as: vg.Selection.crossfilter()}),
      vg.colorScheme('magma'), vg.colorLegend(), vg.width(1120), vg.height(610),
      vg.marginLeft(62), vg.marginBottom(50), vg.xLabel('latent dimension α'), vg.yLabel('latent dimension β')
    ));
  } else if (scene === 'signals') {
    await coordinator.exec(`
      CREATE TABLE signals AS
      SELECT
        i % 100000 AS t,
        CAST(floor(i / 100000) AS INTEGER) AS series,
        sin((i % 100000) * (0.0007 + floor(i / 100000) * 0.00019))
          + 0.34 * cos((i % 100000) * 0.0051)
          + 0.12 * sin(i * 0.071) AS value
      FROM range(${meta.rows}) AS s(i)
    `);
    chart.replaceChildren(vg.plot(
      vg.denseLine(vg.from('signals'), {x: 't', y: 'value', z: 'series'}),
      vg.panZoomX(), vg.colorScheme('turbo'), vg.colorLegend(),
      vg.width(1120), vg.height(610), vg.marginLeft(62), vg.marginBottom(50),
      vg.xLabel('sample index'), vg.yLabel('signal amplitude'), vg.yGrid(true)
    ));
  } else {
    await coordinator.exec(`
      CREATE TABLE events AS
      SELECT
        i,
        24 * ((i % 1440) / 1440.0) AS hour,
        46 + 25 * sin((i % 1440) / 1440.0 * 2 * pi()) + 12 * cos(i * 0.017) + (i % 29) / 5.0 AS latency,
        CASE WHEN i % 3 = 0 THEN 'api' WHEN i % 3 = 1 THEN 'worker' ELSE 'storage' END AS service
      FROM range(${meta.rows}) AS e(i)
    `);
    const select = vg.Selection.crossfilter();
    const points = vg.plot(
      vg.hexbin(vg.from('events'), {x: 'hour', y: 'latency', fill: vg.count(), binWidth: 13}),
      vg.intervalXY({as: select}), vg.colorScheme('viridis'),
      vg.width(1120), vg.height(395), vg.marginLeft(62), vg.xLabel('hour of day'), vg.yLabel('latency (ms)')
    );
    const profile = vg.plot(
      vg.barY(vg.from('events', {filterBy: select}), {x: vg.bin('hour'), y: vg.count(), fill: '#b14c6c'}),
      vg.width(1120), vg.height(205), vg.marginLeft(62), vg.marginBottom(44),
      vg.xLabel('selected hourly profile'), vg.yLabel('events'), vg.yGrid(true)
    );
    chart.replaceChildren(vg.vconcat(points, profile));
  }

  chart.addEventListener('pointerup', () => {
    runtime.interactions += 1;
    status.textContent = `${runtime.interactions} interactions`;
  });
  status.textContent = `${meta.rows.toLocaleString()} rows ready`;
  await new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
  await new Promise(resolveWait => setTimeout(resolveWait, 700));
  runtime.ready = true;
}

build().catch(error => {
  runtime.error = error instanceof Error ? error.stack ?? error.message : String(error);
  document.querySelector('#chart')!.innerHTML = `<pre class="error">${runtime.error}</pre>`;
  document.querySelector('#status')!.textContent = 'failed';
  console.error(error);
});
