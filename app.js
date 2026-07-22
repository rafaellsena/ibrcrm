/* =========================================================================
   IBrCRM Dashboard — app.js
   Roda 100% no navegador (sem servidor/backend). Lê data/municipios.json
   (metadados fixos + flags SDR) e data/series.json (série 2010-2023).
   ========================================================================= */

const CLASS_LABELS = ['Muito baixo', 'Baixo', 'Médio', 'Alto', 'Muito alto'];
const EIXOS = [
  { key: 'idx3', col: 3, campo: 'ambiental', nome: 'Ambiental', desc: 'Conservação, políticas ambientais e sustentabilidade' },
  { key: 'idx4', col: 4, campo: 'social', nome: 'Social', desc: 'Indicadores sociais, qualidade de vida e bem-estar' },
  { key: 'idx5', col: 5, campo: 'infra', nome: 'Infraestrutura', desc: 'Infraestrutura básica, transporte e comunicação' },
  { key: 'idx6', col: 6, campo: 'produtivo', nome: 'Produtivo', desc: 'PIB per capita, emprego e desenvolvimento econômico' },
  { key: 'idx7', col: 7, campo: 'institucional', nome: 'Institucional', desc: 'Governança, transparência e capacidade institucional' },
  { key: 'idx8', col: 8, campo: 'educacao', nome: 'Educação', desc: 'Educação, qualificação profissional e saúde' },
  { key: 'idx9', col: 9, campo: 'inovacao', nome: 'Inovação', desc: 'Inovação, tecnologia e desenvolvimento científico' },
];
const FLAGS_SDR = [
  ['amazonia_legal', 'Amazônia Legal', null],
  ['SUDENE', 'SUDENE', null],
  ['semiarido', 'Semiárido', null],
  ['faixa_fronteira', 'Faixa de Fronteira', null],
  ['matopiba', 'MATOPIBA', null],
  ['cidades_intermediadoras', 'Cidades Intermediadoras', null],
  ['amazonia_azul', 'Amazônia Azul', null],
  ['qualquer_rota', 'Rota de Integração', 'Sim = participa de pelo menos uma das 13 cadeias produtivas (Cacau, Mel, Leite, Açaí etc.)'],
];

let MUNICIPIOS = [];       // metadados fixos
let MUN_BY_CODE = {};      // code_muni -> objeto de metadado
let SERIES = [];           // linhas [code_muni, ano, ibrcrm, idx3..idx9]
let SERIES_BY_CODE = {};   // code_muni -> [linhas ordenadas por ano]
let GEOJSON_MUNICIPIOS = null; // GeoJSON já convertido do topojson, com code_muni em cada feature
let ANO_MIN = 2010, ANO_MAX = 2023;

const state = {
  view: 'principal',
  filtros: { bioma: 'Todos', regiao: 'Todas', estado: 'Todos', tipologia_ibge: 'Todas', tipologia_pndr: 'Todas',
    flags: Object.fromEntries(FLAGS_SDR.map(f => [f[0], 'Todos'])) },
  buscaTexto: '',
  selecionado: null,
  comparacao: [],
  anoAnalise: 2023,
  periodo: [2010, 2023],
  eixoMapa: 'geral',
};

let charts = {}; // instâncias Chart.js ativas, por id de canvas
let mapaLeaflet = null;

/* --------------------------------- boot --------------------------------- */

async function boot() {
  const [muns, series, topo] = await Promise.all([
    fetch('data/municipios.json').then(r => r.json()),
    fetch('data/series.json').then(r => r.json()),
    fetch('data/municipios_topo.json').then(r => r.json()),
  ]);
  MUNICIPIOS = muns;
  MUN_BY_CODE = Object.fromEntries(muns.map(m => [m.code_muni, m]));
  SERIES = series;
  SERIES_BY_CODE = {};
  for (const row of series) {
    const cod = row[0];
    (SERIES_BY_CODE[cod] ||= []).push(row);
  }
  for (const cod in SERIES_BY_CODE) SERIES_BY_CODE[cod].sort((a, b) => a[1] - b[1]);
  ANO_MIN = Math.min(...series.map(r => r[1]));
  ANO_MAX = Math.max(...series.map(r => r[1]));
  state.anoAnalise = ANO_MAX;
  state.periodo = [ANO_MIN, ANO_MAX];

  // topojson -> geojson; o id do IBGE vem com 7 dígitos (com dígito verificador),
  // nossa base usa 6 dígitos — o código de 6 dígitos é sempre o de 7 dígitos sem o último dígito
  const objName = Object.keys(topo.objects)[0];
  GEOJSON_MUNICIPIOS = topojson.feature(topo, topo.objects[objName]);
  for (const feat of GEOJSON_MUNICIPIOS.features) {
    const id7 = parseInt(feat.properties.id, 10);
    feat.properties.code_muni = Math.floor(id7 / 10);
  }

  renderSidebar();
  wireTopnav();
  renderView();
}

/* ------------------------------- filtros --------------------------------- */

function opcoesUnicas(campo) {
  return [...new Set(MUNICIPIOS.map(m => m[campo]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function municipiosFiltrados() {
  const f = state.filtros;
  return MUNICIPIOS.filter(m => {
    if (f.bioma !== 'Todos' && m.bioma !== f.bioma) return false;
    if (f.regiao !== 'Todas' && m.regiao !== f.regiao) return false;
    if (f.estado !== 'Todos' && m.uf !== f.estado) return false;
    if (f.tipologia_ibge !== 'Todas' && m.tipologia_ibge !== f.tipologia_ibge) return false;
    if (f.tipologia_pndr !== 'Todas' && m.pndr !== f.tipologia_pndr) return false;
    for (const [campo] of FLAGS_SDR) {
      const sel = f.flags[campo];
      if (sel === 'Sim' && !m[campo]) return false;
      if (sel === 'Não' && m[campo]) return false;
    }
    return true;
  });
}

/* ------------------------------- sidebar ---------------------------------- */

function renderSidebar() {
  const el = document.getElementById('sidebar');
  const biomas = opcoesUnicas('bioma'), regioes = opcoesUnicas('regiao'), estados = opcoesUnicas('uf');
  const tIbge = opcoesUnicas('tipologia_ibge'), tPndr = opcoesUnicas('pndr');

  const opt = (arr, sel) => arr.map(v => `<option ${v === sel ? 'selected' : ''}>${v}</option>`).join('');

  el.innerHTML = `
    <h3>Filtros de Análise</h3>
    <div class="group"><div class="group-label">Bioma</div>
      <select id="f-bioma"><option>Todos</option>${opt(biomas, state.filtros.bioma)}</select></div>
    <div class="group"><div class="group-label">Região</div>
      <select id="f-regiao"><option>Todas</option>${opt(regioes, state.filtros.regiao)}</select></div>
    <div class="group"><div class="group-label">Estado</div>
      <select id="f-estado"><option>Todos</option>${opt(estados, state.filtros.estado)}</select></div>
    <div class="group"><div class="group-label">Tipologia (IBGE)</div>
      <select id="f-tibge"><option>Todas</option>${opt(tIbge, state.filtros.tipologia_ibge)}</select></div>
    <div class="group"><div class="group-label">Tipologia (PNDR)</div>
      <select id="f-tpndr"><option>Todas</option>${opt(tPndr, state.filtros.tipologia_pndr)}</select></div>

    <div class="new-block">
      <div class="group-label">Programas e Rotas SDR</div>
      ${FLAGS_SDR.map(([campo, label, tip]) => `
        <div class="flag-row">
          <span>${label}${tip ? `<span class="info" title="${tip}">i</span>` : ''}</span>
          <div class="seg" data-flag="${campo}">
            <button data-v="Todos" class="${state.filtros.flags[campo] === 'Todos' ? 'on' : ''}">Todos</button>
            <button data-v="Sim" class="${state.filtros.flags[campo] === 'Sim' ? 'on' : ''}">Sim</button>
            <button data-v="Não" class="${state.filtros.flags[campo] === 'Não' ? 'on' : ''}">Não</button>
          </div>
        </div>`).join('')}
    </div>

    <div class="divider"></div>
    <div class="group">
      <div class="group-label" id="busca-label">Selecionar Município</div>
      <input type="text" id="busca-municipio" placeholder="Digite o nome do município...">
      <div class="muni-count" id="muni-count"></div>
      <div class="muni-list" id="muni-list"></div>
    </div>
    <div id="selecionados-wrap"></div>

    <div class="divider"></div>
    <div class="group"><div class="group-label">Ano de Análise</div>
      <select id="f-ano"></select></div>
    <div class="group"><div class="group-label">Período da Série</div>
      <div style="display:flex;gap:8px;">
        <select id="f-ano-ini" style="flex:1"></select>
        <select id="f-ano-fim" style="flex:1"></select>
      </div>
    </div>
    <div class="group" id="eixo-mapa-wrap" style="display:none">
      <div class="group-label">Eixo de Análise (mapa)</div>
      <select id="f-eixo-mapa">
        <option value="geral">Geral</option>
        ${EIXOS.map(e => `<option value="${e.key}">${e.nome}</option>`).join('')}
      </select>
    </div>
  `;

  // anos
  const anoSel = document.getElementById('f-ano');
  const anoIniSel = document.getElementById('f-ano-ini');
  const anoFimSel = document.getElementById('f-ano-fim');
  for (let a = ANO_MIN; a <= ANO_MAX; a++) {
    anoSel.innerHTML += `<option ${a === state.anoAnalise ? 'selected' : ''}>${a}</option>`;
    anoIniSel.innerHTML += `<option ${a === state.periodo[0] ? 'selected' : ''}>${a}</option>`;
    anoFimSel.innerHTML += `<option ${a === state.periodo[1] ? 'selected' : ''}>${a}</option>`;
  }

  // eventos dos dropdowns simples
  const bind = (id, key) => document.getElementById(id).addEventListener('change', e => {
    state.filtros[key] = e.target.value; renderMuniList(); renderView();
  });
  bind('f-bioma', 'bioma'); bind('f-regiao', 'regiao'); bind('f-estado', 'estado');
  bind('f-tibge', 'tipologia_ibge'); bind('f-tpndr', 'tipologia_pndr');

  document.getElementById('f-ano').addEventListener('change', e => { state.anoAnalise = +e.target.value; renderView(); });
  document.getElementById('f-ano-ini').addEventListener('change', e => { state.periodo[0] = +e.target.value; renderView(); });
  document.getElementById('f-ano-fim').addEventListener('change', e => { state.periodo[1] = +e.target.value; renderView(); });
  document.getElementById('f-eixo-mapa').addEventListener('change', e => { state.eixoMapa = e.target.value; renderView(); });

  // flags SDR (seletor de 3 estados)
  el.querySelectorAll('.seg').forEach(seg => {
    seg.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const campo = seg.dataset.flag;
        state.filtros.flags[campo] = btn.dataset.v;
        seg.querySelectorAll('button').forEach(b => b.classList.remove('on'));
        btn.classList.add('on');
        renderMuniList(); renderView();
      });
    });
  });

  // busca de município
  document.getElementById('busca-municipio').addEventListener('input', e => {
    state.buscaTexto = e.target.value.toLowerCase();
    renderMuniList();
  });

  renderMuniList();
  renderSelecionados();
}

function renderMuniList() {
  const listaEl = document.getElementById('muni-list');
  const countEl = document.getElementById('muni-count');
  const filtrados = municipiosFiltrados().filter(m =>
    !state.buscaTexto || m.nome.toLowerCase().includes(state.buscaTexto)
  );
  countEl.textContent = `${filtrados.length} municípios encontrados`;
  listaEl.innerHTML = filtrados.slice(0, 60).map(m =>
    `<div data-cod="${m.code_muni}">${m.nome} (${m.uf})</div>`
  ).join('');
  listaEl.querySelectorAll('div').forEach(d => {
    d.addEventListener('click', () => {
      const cod = +d.dataset.cod;
      if (state.view === 'series') {
        if (!state.comparacao.includes(cod) && state.comparacao.length < 8) state.comparacao.push(cod);
      } else {
        state.selecionado = cod;
        if (state.view !== 'subindices') {
          state.view = 'subindices';
          wireTopnav(true);
          document.getElementById('eixo-mapa-wrap').style.display = 'none';
        }
      }
      renderSelecionados(); renderView();
    });
  });
}

function renderSelecionados() {
  const wrap = document.getElementById('selecionados-wrap');
  if (state.view === 'series') {
    wrap.innerHTML = state.comparacao.map(cod => {
      const m = MUN_BY_CODE[cod];
      return `<span class="chip">${m ? m.nome + ' (' + m.uf + ')' : cod}<button data-cod="${cod}">✕</button></span>`;
    }).join('');
    wrap.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      state.comparacao = state.comparacao.filter(c => c !== +b.dataset.cod);
      renderSelecionados(); renderView();
    }));
  } else if (state.view === 'subindices' && state.selecionado) {
    const m = MUN_BY_CODE[state.selecionado];
    wrap.innerHTML = m ? `
      <div class="divider"></div>
      <div class="group-label">Município Selecionado</div>
      <div style="font-size:12.5px;line-height:1.9;">
        <b>${m.nome} (${m.uf})</b><br>
        Região: ${m.regiao} · Bioma: ${m.bioma}<br>
        Tipologia (PNDR): ${m.pndr}
      </div>` : '';
  } else {
    wrap.innerHTML = '';
  }
}

/* -------------------------------- topnav ---------------------------------- */

function wireTopnav(skipBind) {
  const nav = document.getElementById('topnav');
  nav.querySelectorAll('a').forEach(a => {
    a.classList.toggle('active', a.dataset.view === state.view);
    if (!skipBind) {
      a.addEventListener('click', () => {
        state.view = a.dataset.view;
        nav.querySelectorAll('a').forEach(x => x.classList.remove('active'));
        a.classList.add('active');
        document.getElementById('eixo-mapa-wrap').style.display = state.view === 'mapas' ? 'block' : 'none';
        renderSelecionados();
        renderView();
      });
    }
  });
  document.getElementById('eixo-mapa-wrap').style.display = state.view === 'mapas' ? 'block' : 'none';
}

/* -------------------------------- helpers ---------------------------------- */

function classifica01(v) {
  if (v >= 0.8) return 4; if (v >= 0.6) return 3; if (v >= 0.4) return 2; if (v >= 0.2) return 1; return 0;
}
function linhaAno(cod, ano) {
  const s = SERIES_BY_CODE[cod]; if (!s) return null;
  return s.find(r => r[1] === ano) || null;
}
function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

/* -------------------------------- views ------------------------------------ */

function renderView() {
  const main = document.getElementById('main');
  if (state.view === 'principal') return renderPrincipal(main);
  if (state.view === 'mapas') return renderMapas(main);
  if (state.view === 'series') return renderSeries(main);
  if (state.view === 'subindices') return renderSubindices(main);
}

function renderPrincipal(main) {
  const n = municipiosFiltrados().length;
  main.innerHTML = `
    <div class="hero">
      <h1><span>IBr</span>CRM Dashboard</h1>
      <p>Sistema de Análise de Competitividade Regional Municipal</p>
      <div class="stat-row">
        <div class="stat"><b>${n.toLocaleString('pt-BR')}</b><span>municípios no recorte atual</span></div>
        <div class="stat"><b>7</b><span>eixos analisados</span></div>
        <div class="stat"><b>${ANO_MIN}–${ANO_MAX}</b><span>período coberto</span></div>
      </div>
    </div>
    <div class="card">
      <h2>Interpretação do índice</h2>
      <div class="desc">O índice varia de 0 a 1 — valores mais próximos de 1 indicam maior competitividade regional.</div>
      <table><tbody>
        <tr><td><b>0,8 – 1,0</b></td><td>Muito alto</td></tr>
        <tr><td><b>0,6 – 0,8</b></td><td>Alto</td></tr>
        <tr><td><b>0,4 – 0,6</b></td><td>Médio</td></tr>
        <tr><td><b>0,2 – 0,4</b></td><td>Baixo</td></tr>
        <tr><td><b>0,0 – 0,2</b></td><td>Muito baixo</td></tr>
      </tbody></table>
    </div>
  `;
}

function renderMapas(main) {
  main.innerHTML = `
    <div class="titlebar"><h1>Mapas</h1><div class="sub">Distribuição geográfica do IBrCRM — ano ${state.anoAnalise}</div></div>
    <div class="card"><div id="map"></div></div>
  `;

  if (mapaLeaflet) { mapaLeaflet.remove(); mapaLeaflet = null; }
  mapaLeaflet = L.map('map', { scrollWheelZoom: false }).setView([-14.2, -51.9], 4);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap, © CARTO', maxZoom: 12,
  }).addTo(mapaLeaflet);

  const cores = ['#c23a3a', '#e07a3f', '#b6790a', '#3fa66a', '#1f8a5b'];
  const corForaFiltro = '#e4e8ef';
  const eixo = EIXOS.find(e => e.key === state.eixoMapa);
  const codigosNoFiltro = new Set(municipiosFiltrados().map(m => m.code_muni));

  const camada = L.geoJSON(GEOJSON_MUNICIPIOS, {
    style: feature => {
      const cod = feature.properties.code_muni;
      if (!codigosNoFiltro.has(cod)) return { color: '#fff', weight: 0.3, fillColor: corForaFiltro, fillOpacity: 0.6 };
      const row = linhaAno(cod, state.anoAnalise);
      if (!row) return { color: '#fff', weight: 0.3, fillColor: corForaFiltro, fillOpacity: 0.6 };
      const classe = eixo ? row[eixo.col] : classifica01(row[2]);
      return { color: '#fff', weight: 0.3, fillColor: cores[classe] ?? corForaFiltro, fillOpacity: 0.85 };
    },
    onEachFeature: (feature, layer) => {
      const cod = feature.properties.code_muni;
      const m = MUN_BY_CODE[cod];
      const row = linhaAno(cod, state.anoAnalise);
      const classe = row ? (eixo ? row[eixo.col] : classifica01(row[2])) : null;
      const txt = !m ? feature.properties.name
        : !codigosNoFiltro.has(cod) ? `<b>${m.nome} (${m.uf})</b><br>fora do recorte atual`
        : !row ? `<b>${m.nome} (${m.uf})</b><br>sem dado em ${state.anoAnalise}`
        : `<b>${m.nome} (${m.uf})</b><br>${eixo ? eixo.nome : 'Índice Geral'}: ${CLASS_LABELS[classe]}`;
      layer.bindTooltip(txt, { sticky: true });
      layer.on('mouseover', () => layer.setStyle({ weight: 1.4, color: '#1b2430' }));
      layer.on('mouseout', () => layer.setStyle({ weight: 0.3, color: '#fff' }));
    },
  }).addTo(mapaLeaflet);

  const legendaEl = L.control({ position: 'bottomright' });
  legendaEl.onAdd = () => {
    const div = L.DomUtil.create('div', 'legend');
    div.innerHTML = `<b>Classificação</b><br>` + CLASS_LABELS.map((l, i) => `<i style="background:${cores[i]}"></i>${l}`).join('<br>')
      + `<br><i style="background:${corForaFiltro}"></i>Sem dado / fora do filtro`;
    return div;
  };
  legendaEl.addTo(mapaLeaflet);
  setTimeout(() => mapaLeaflet.invalidateSize(), 50);
}

function renderSeries(main) {
  main.innerHTML = `
    <div class="titlebar"><h1>Séries Temporais</h1><div class="sub">Evolução do Índice Geral (${state.periodo[0]}–${state.periodo[1]})</div></div>
    <div class="card"><h2>Evolução Temporal</h2><div class="chartwrap"><canvas id="chart-series"></canvas></div></div>
    <div class="card"><h2>Tabela de Resultados</h2><div id="tabela-series"></div></div>
  `;
  if (!state.comparacao.length) {
    document.getElementById('tabela-series').innerHTML = `<div class="desc">Use a busca na barra lateral para adicionar municípios à comparação.</div>`;
    destroyChart('chart-series');
    return;
  }

  destroyChart('chart-series');
  const cores = ['#2f5fe0', '#c23a3a', '#e6b800', '#1f8a5b', '#a340c9', '#e07a3f', '#0aa5b0', '#7a5cff'];
  const datasets = state.comparacao.map((cod, i) => {
    const m = MUN_BY_CODE[cod];
    const linhas = (SERIES_BY_CODE[cod] || []).filter(r => r[1] >= state.periodo[0] && r[1] <= state.periodo[1]);
    return { label: `${m.nome} (${m.uf})`, data: linhas.map(r => ({ x: r[1], y: r[2] })), borderColor: cores[i % cores.length], backgroundColor: cores[i % cores.length] + '33', tension: 0.3, pointRadius: 3 };
  });
  charts['chart-series'] = new Chart(document.getElementById('chart-series'), {
    type: 'line',
    data: { datasets },
    options: { responsive: true, maintainAspectRatio: false, scales: { x: { type: 'linear', ticks: { stepSize: 1 } }, y: { min: 0, max: 1 } }, plugins: { legend: { position: 'top', labels: { boxWidth: 10, font: { size: 11 } } } } },
  });

  let linhasTabela = [];
  for (const cod of state.comparacao) {
    const m = MUN_BY_CODE[cod];
    for (const r of (SERIES_BY_CODE[cod] || [])) {
      if (r[1] < state.periodo[0] || r[1] > state.periodo[1]) continue;
      linhasTabela.push({ nome: `${m.nome} (${m.uf})`, uf: m.uf, ano: r[1], classe: classifica01(r[2]) });
    }
  }
  document.getElementById('tabela-series').innerHTML = `
    <div class="desc">${linhasTabela.length} resultados · ${state.comparacao.length} município(s)
      <span class="export-link" id="exp-csv-series">Exportar CSV</span></div>
    <table><thead><tr><th>Município</th><th>UF</th><th>Ano</th><th>Classificação</th></tr></thead>
    <tbody>${linhasTabela.slice(0, 40).map(l => `<tr><td>${l.nome}</td><td>${l.uf}</td><td>${l.ano}</td><td>${CLASS_LABELS[l.classe]}</td></tr>`).join('')}</tbody></table>
  `;
  document.getElementById('exp-csv-series').addEventListener('click', () => exportarCSV(linhasTabela, 'series_ibrcrm.csv'));
}

function renderSubindices(main) {
  const m = MUN_BY_CODE[state.selecionado];
  if (!m) {
    main.innerHTML = `<div class="titlebar"><h1>Subíndices</h1></div><div class="card desc">Selecione um município na barra lateral para ver a análise detalhada.</div>`;
    return;
  }
  const row = linhaAno(m.code_muni, state.anoAnalise);
  const serieCompleta = (SERIES_BY_CODE[m.code_muni] || []).filter(r => r[1] >= state.periodo[0] && r[1] <= state.periodo[1]);

  const ativos = FLAGS_SDR.filter(([campo]) => m[campo]).map(([, label]) => label);
  const notaHtml = ativos.length ? '' : `<div class="note">Este município não está classificado em nenhum programa territorial da SDR nem em nenhuma Rota de Integração — os filtros de Programas e Rotas SDR não afetam esta visão.</div>`;

  main.innerHTML = `
    <div class="titlebar"><h1>${m.nome} (${m.uf})</h1><div class="sub">Análise detalhada dos subíndices — série ${state.periodo[0]}–${state.periodo[1]}</div></div>
    ${notaHtml}
    <div class="card">
      <h2>Análise de Subíndices — ${state.anoAnalise}</h2>
      <div class="desc">Componentes que compõem o Índice Brasileiro de Competitividade Regional Municipal (IBrCRM).</div>
      <div id="cards-subindices"></div>
    </div>
    <div class="card"><h2>Evolução dos Subíndices</h2><div class="chartwrap"><canvas id="chart-subindices"></canvas></div></div>
    <div class="card"><h2>Classificações Anuais</h2><div id="tabela-subindices"></div></div>
  `;

  const cardsEl = document.getElementById('cards-subindices');
  if (!row) {
    cardsEl.innerHTML = `<div class="desc">Sem dado para o ano ${state.anoAnalise}.</div>`;
  } else {
    const classeGeral = classifica01(row[2]);
    cardsEl.innerHTML = `
      <div class="idx-card geral" style="margin-bottom:10px;">
        <div class="top"><span class="name">Índice Geral</span><span class="badge b${classeGeral}">${CLASS_LABELS[classeGeral]}</span></div>
        <div class="txt">Avaliação geral da competitividade regional municipal · valor ${row[2].toFixed(3)}</div>
      </div>
      <div class="grid7">
        ${EIXOS.map(e => `
          <div class="idx-card">
            <div class="top"><span class="name">${e.nome}</span><span class="badge b${row[e.col]}">${CLASS_LABELS[row[e.col]]}</span></div>
            <div class="txt">${e.desc}</div>
          </div>`).join('')}
      </div>
    `;
  }

  destroyChart('chart-subindices');
  const coresEixo = { 2: '#2f5fe0', 3: '#1f8a5b', 4: '#c23a3a', 5: '#e6b800', 6: '#7a5cff', 7: '#0aa5b0', 8: '#e07a3f', 9: '#a340c9' };
  const nomesCol = { 2: 'Índice Geral', 3: 'Ambiental', 4: 'Social', 5: 'Infraestrutura', 6: 'Produtivo', 7: 'Institucional', 8: 'Educação', 9: 'Inovação' };
  const datasets = [2, 3, 4, 5, 6, 7, 8, 9].map(col => ({
    label: nomesCol[col], data: serieCompleta.map(r => ({ x: r[1], y: col === 2 ? r[2] : r[col] / 4 })),
    borderColor: coresEixo[col], tension: 0.3, pointRadius: 2, borderWidth: col === 2 ? 3 : 1.5,
  }));
  charts['chart-subindices'] = new Chart(document.getElementById('chart-subindices'), {
    type: 'line',
    data: { datasets },
    options: { responsive: true, maintainAspectRatio: false, scales: { x: { type: 'linear', ticks: { stepSize: 1 } }, y: { min: 0, max: 1 } }, plugins: { legend: { position: 'top', labels: { boxWidth: 10, font: { size: 10 } } } } },
  });

  document.getElementById('tabela-subindices').innerHTML = `
    <div class="desc">${m.nome} (${m.uf}) · ${serieCompleta.length} anos
      <span class="export-link" id="exp-csv-sub">Exportar CSV</span></div>
    <table>
      <thead><tr><th>Ano</th><th>Ambiental</th><th>Social</th><th>Infra</th><th>Produtivo</th><th>Institucional</th><th>Educação</th><th>Inovação</th><th>Índice Geral</th></tr></thead>
      <tbody>${[...serieCompleta].reverse().map(r => `
        <tr><td><b>${r[1]}</b></td><td>${CLASS_LABELS[r[3]]}</td><td>${CLASS_LABELS[r[4]]}</td><td>${CLASS_LABELS[r[5]]}</td>
        <td>${CLASS_LABELS[r[6]]}</td><td>${CLASS_LABELS[r[7]]}</td><td>${CLASS_LABELS[r[8]]}</td><td>${CLASS_LABELS[r[9]]}</td>
        <td><b style="color:var(--blue)">${CLASS_LABELS[classifica01(r[2])]}</b></td></tr>`).join('')}</tbody>
    </table>
  `;
  document.getElementById('exp-csv-sub').addEventListener('click', () => {
    const linhas = serieCompleta.map(r => ({ ano: r[1], ambiental: CLASS_LABELS[r[3]], social: CLASS_LABELS[r[4]], infra: CLASS_LABELS[r[5]], produtivo: CLASS_LABELS[r[6]], institucional: CLASS_LABELS[r[7]], educacao: CLASS_LABELS[r[8]], inovacao: CLASS_LABELS[r[9]], indice_geral: CLASS_LABELS[classifica01(r[2])] }));
    exportarCSV(linhas, `ibrcrm_${m.nome.replace(/\s+/g, '_')}.csv`);
  });
}

/* ------------------------------- exportação -------------------------------- */

function exportarCSV(linhas, nomeArquivo) {
  if (!linhas.length) return;
  const cabecalho = Object.keys(linhas[0]);
  const csv = [cabecalho.join(';'), ...linhas.map(l => cabecalho.map(c => l[c]).join(';'))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nomeArquivo; a.click();
  URL.revokeObjectURL(url);
}

boot();
