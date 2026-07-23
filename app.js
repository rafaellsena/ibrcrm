/* =========================================================================
   IBrCRM Dashboard — app.js
   Roda 100% no navegador (sem servidor/backend). Lê data/municipios.json
   (metadados fixos + flags SDR) e data/series.json (série 2010-2023).
   ========================================================================= */

const CLASS_LABELS = ['Muito baixo', 'Baixo', 'Médio', 'Alto', 'Muito alto'];
const EIXOS = [
  { key: 'idx3', col: 3, valCol: 10, campo: 'ambiental', nome: 'Ambiental', desc: 'Conservação, políticas ambientais e sustentabilidade' },
  { key: 'idx4', col: 4, valCol: 11, campo: 'social', nome: 'Social', desc: 'Indicadores sociais, qualidade de vida e bem-estar' },
  { key: 'idx5', col: 5, valCol: 12, campo: 'infra', nome: 'Infraestrutura', desc: 'Infraestrutura básica, transporte e comunicação' },
  { key: 'idx6', col: 6, valCol: 13, campo: 'produtivo', nome: 'Produtivo', desc: 'PIB per capita, emprego e desenvolvimento econômico' },
  { key: 'idx7', col: 7, valCol: 14, campo: 'institucional', nome: 'Institucional', desc: 'Governança, transparência e capacidade institucional' },
  { key: 'idx8', col: 8, valCol: 15, campo: 'educacao', nome: 'Educação', desc: 'Educação, qualificação profissional e saúde' },
  { key: 'idx9', col: 9, valCol: 16, campo: 'inovacao', nome: 'Inovação', desc: 'Inovação, tecnologia e desenvolvimento científico' },
];
const ICONS_EIXO = {
  'Geral': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 4 5.5 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.5-4-9s1.5-6.5 4-9z"/></svg>',
  'Ambiental': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21c-4-2-7-6-7-11a7 7 0 0 1 14 0c0 5-3 9-7 11z"/><path d="M12 21V9"/></svg>',
  'Inovação': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 18h6M10 21h4M8 12a4 4 0 1 1 8 0c0 2-1.5 3-2 4H10c-.5-1-2-2-2-4z"/></svg>',
  'Social': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3"/><path d="M2 20c0-3.3 3-6 7-6s7 2.7 7 6"/><circle cx="17" cy="8" r="2.3"/><path d="M17 14c2.8.3 5 2.5 5 6"/></svg>',
  'Infraestrutura': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6"/></svg>',
  'Produtivo': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20V10M10 20V4M16 20v-7M4 20h16"/></svg>',
  'Institucional': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 10h16M5 10l7-5 7 5M6 10v9M18 10v9M3 21h18M9 13v4M15 13v4"/></svg>',
  'Educação': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 8l10-4 10 4-10 4-10-4z"/><path d="M6 10v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5M22 8v6"/></svg>',
};

const FLAGS_SDR = [
  ['amazonia_legal', 'Amazônia Legal', null],
  ['SUDENE', 'SUDENE', null],
  ['sudeco', 'SUDECO', 'Municípios de MT, MS, GO e DF — área de atuação definida pela Lei Complementar 129/2009'],
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
let mapaMiniLeaflet = null;

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
      <div class="group-label">Abrangência</div>
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
  const sidebar = document.getElementById('sidebar');
  const irPara = v => {
    state.view = v;
    document.querySelectorAll('nav.topnav a').forEach(x => x.classList.toggle('active', x.dataset.view === v));
    document.getElementById('eixo-mapa-wrap').style.display = v === 'mapas' ? 'block' : 'none';
    sidebar.style.display = (v === 'metodologia' || v === 'principal') ? 'none' : '';
    renderSelecionados();
    renderView();
  };
  nav.querySelectorAll('a').forEach(a => {
    a.classList.toggle('active', a.dataset.view === state.view);
    if (!skipBind) a.addEventListener('click', () => irPara(a.dataset.view));
  });
  document.getElementById('eixo-mapa-wrap').style.display = state.view === 'mapas' ? 'block' : 'none';
  sidebar.style.display = (state.view === 'metodologia' || state.view === 'principal') ? 'none' : '';
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
  if (state.view === 'metodologia') return renderMetodologia(main);
}

function renderPrincipal(main) {
  const biomas = opcoesUnicas('bioma');
  const estados = opcoesUnicas('uf');

  const eixosComGeral = [{ nome: 'Geral' }, ...EIXOS];
  const EXEMPLO_MUNICIPIOS = [
    { nome: 'Adamantina', uf: 'SP', cor: '#1565c0' },
    { nome: 'Angra dos Reis', uf: 'RJ', cor: '#c62828' },
    { nome: 'Abadia dos Dourados', uf: 'MG', cor: '#e6b800' },
  ];

  main.innerHTML = `
    <div class="hero">
      <div class="hero-top">
        <h1><span>IBr</span>CRM Dashboard</h1>
        <p>Sistema de Análise de Competitividade Regional Municipal</p>
        <div class="hero-search">
          <input type="text" id="busca-hero" placeholder="Ex.: São Paulo, Salvador, Santos...">
          <button id="busca-hero-btn">→</button>
        </div>
      </div>
      <div class="hero-bottom">
        <div class="icon-circ">⌂</div>
        <h2>Bem-vindo ao Sistema de Análise de Competitividade Regional Municipal</h2>
        <div class="sub">O IBrCRM é uma ferramenta analítica desenvolvida para avaliar e comparar a capacidade competitiva dos municípios brasileiros.</div>
      </div>
    </div>

    <div class="card" style="text-align:center;">
      <div class="icon-circ">◎</div>
      <h2>Objetivos</h2>
      <div class="card-grid4">
        <div class="mini-card"><div class="ic">▤</div><p>Medir a competitividade regional com base em múltiplas dimensões.</p></div>
        <div class="mini-card"><div class="ic">⇄</div><p>Permitir comparações temporais e espaciais entre municípios.</p></div>
        <div class="mini-card"><div class="ic">★</div><p>Identificar pontos fortes e oportunidades de melhoria.</p></div>
        <div class="mini-card"><div class="ic">✓</div><p>Subsidiar políticas públicas.</p></div>
      </div>
    </div>

    <div class="card" style="text-align:center;">
      <div class="icon-circ">◐</div>
      <h2>Eixos analisados</h2>
      <div class="eixo-grid8">
        ${eixosComGeral.map(e => `<div class="mini-card"><div class="ic" style="width:26px;height:26px;margin:0 auto 8px;">${ICONS_EIXO[e.nome] || ''}</div><p><b style="color:var(--ink)">${e.nome}</b></p></div>`).join('')}
      </div>
    </div>

    <div class="card" style="text-align:center;">
      <div class="icon-circ">⊕</div>
      <h2>Panorama de cobertura</h2>
      <div class="cobertura-row">
        <div class="cobertura-item"><div class="cobertura-circ">${biomas.length}</div><span>Biomas</span></div>
        <div class="cobertura-item"><div class="cobertura-circ">${estados.length}</div><span>Estados</span></div>
        <div class="cobertura-item"><div class="cobertura-circ">${MUNICIPIOS.length.toLocaleString('pt-BR')}</div><span>Municípios</span></div>
        <div class="cobertura-item"><div class="cobertura-circ" style="font-size:26px;">▦</div><span>Tipologia (IBGE)</span></div>
        <div class="cobertura-item"><div class="cobertura-circ" style="font-size:26px;">▥</div><span>Tipologia (PNDR)</span></div>
        <div class="cobertura-item"><div class="cobertura-circ" style="font-size:15px;">${ANO_MIN}–<br>${ANO_MAX}</div><span>Período</span></div>
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

    <div class="card" style="text-align:center;">
      <div class="icon-circ">★</div>
      <h2>Exemplos de aplicação</h2>
      <div class="desc">Visualize dados reais do sistema em ação</div>
      <div class="exemplo-grid">
        <div class="exemplo-box">
          <div class="tit">Evolução Temporal — ${EXEMPLO_MUNICIPIOS.map(m => `${m.nome} (${m.uf})`).join(', ')}</div>
          <div class="mini-chartwrap"><canvas id="chart-mini"></canvas></div>
        </div>
        <div class="exemplo-box">
          <div class="tit">Classificação Geral — Região Nordeste (${ANO_MAX})</div>
          <div id="map-mini"></div>
        </div>
      </div>
    </div>

    <div class="card" style="text-align:center;">
      <div class="icon-circ">➤</div>
      <h2>Comece sua Análise</h2>
      <div class="desc">Escolha um módulo e inicie sua análise</div>
      <div class="card-grid4">
        <div class="mini-card link" data-ir="mapas"><div class="ic-circ">▦</div><b>Mapas</b><p>Visualizações geográficas da competitividade e dos biomas.</p></div>
        <div class="mini-card link" data-ir="series"><div class="ic-circ">⤳</div><b>Séries temporais</b><p>Evolução temporal dos indicadores e do índice.</p></div>
        <div class="mini-card link" data-ir="subindices"><div class="ic-circ">▤</div><b>Subíndices</b><p>Análise dos componentes que compõem o índice.</p></div>
        <div class="mini-card link" data-ir="metodologia"><div class="ic-circ">▤</div><b>Metodologia</b><p>Documentação, fontes e critérios de cálculo do índice.</p></div>
      </div>
    </div>
  `;

  const irEBuscar = () => {
    const termo = document.getElementById('busca-hero').value.trim().toLowerCase();
    if (!termo) return;
    const achado = MUNICIPIOS.find(m => m.nome.toLowerCase().startsWith(termo)) || MUNICIPIOS.find(m => m.nome.toLowerCase().includes(termo));
    if (!achado) return;
    state.selecionado = achado.code_muni;
    document.querySelector('nav.topnav a[data-view="subindices"]').click();
  };
  document.getElementById('busca-hero-btn').addEventListener('click', irEBuscar);
  document.getElementById('busca-hero').addEventListener('keydown', e => { if (e.key === 'Enter') irEBuscar(); });

  main.querySelectorAll('[data-ir]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      const v = el.dataset.ir;
      document.querySelector(`nav.topnav a[data-view="${v}"]`).click();
    });
  });

  // mini gráfico: 3 municípios de exemplo, evolução real do índice geral
  destroyChart('chart-mini');
  const datasetsExemplo = EXEMPLO_MUNICIPIOS.map(ex => {
    const m = MUNICIPIOS.find(mm => mm.nome === ex.nome && mm.uf === ex.uf);
    const linhas = m ? (SERIES_BY_CODE[m.code_muni] || []) : [];
    return { label: `${ex.nome} (${ex.uf})`, data: linhas.map(r => ({ x: r[1], y: r[2] })), borderColor: ex.cor, backgroundColor: ex.cor + '22', tension: .3, pointRadius: 2 };
  });
  charts['chart-mini'] = new Chart(document.getElementById('chart-mini'), {
    type: 'line',
    data: { datasets: datasetsExemplo },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 10 } } } }, scales: { x: { type: 'linear', ticks: { stepSize: 1, font: { size: 10 } } }, y: { min: 0, max: 1 } } },
  });

  // mini mapa: classificação geral do ano mais recente, só Região Nordeste
  const cores = ['#c62828', '#e07a3f', '#b6790a', '#3fa66a', '#009C3B'];
  if (mapaMiniLeaflet) { mapaMiniLeaflet.remove(); mapaMiniLeaflet = null; }
  mapaMiniLeaflet = L.map('map-mini', { zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, attributionControl: false });
  const camadaNordeste = L.geoJSON(GEOJSON_MUNICIPIOS, {
    filter: feature => MUN_BY_CODE[feature.properties.code_muni]?.regiao === 'Nordeste',
    style: feature => {
      const row = linhaAno(feature.properties.code_muni, ANO_MAX);
      return { color: '#fff', weight: 0.2, fillColor: row ? cores[classifica01(row[2])] : '#e4e8ef', fillOpacity: 0.9 };
    },
  }).addTo(mapaMiniLeaflet);
  mapaMiniLeaflet.fitBounds(camadaNordeste.getBounds());
  setTimeout(() => mapaMiniLeaflet.invalidateSize(), 50);
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

    <div class="card">
      <h2>Evolução por Abrangência</h2>
      <div class="desc" id="desc-abrangencia"></div>
      <div class="chartwrap"><canvas id="chart-abrangencia"></canvas></div>
    </div>

    <div class="card"><h2>Comparação de Municípios Selecionados</h2><div class="chartwrap"><canvas id="chart-series"></canvas></div></div>
    <div class="card"><h2>Tabela de Resultados</h2><div id="tabela-series"></div></div>
  `;

  // ---- gráfico de cima: média + faixa (P25–P75) do recorte atual da barra lateral ----
  destroyChart('chart-abrangencia');
  const filtrados = municipiosFiltrados();
  const codigosFiltrados = new Set(filtrados.map(m => m.code_muni));
  const porAnoAbrangencia = {};
  for (const r of SERIES) {
    if (r[1] < state.periodo[0] || r[1] > state.periodo[1]) continue;
    if (!codigosFiltrados.has(r[0])) continue;
    (porAnoAbrangencia[r[1]] ||= []).push(r[2]);
  }
  const percentil = (arr, p) => {
    const s = [...arr].sort((a, b) => a - b);
    const idx = (p / 100) * (s.length - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (idx - lo);
  };
  const anosAbrangencia = Object.keys(porAnoAbrangencia).map(Number).sort((a, b) => a - b);
  const media = anosAbrangencia.map(a => { const v = porAnoAbrangencia[a]; return v.reduce((s, x) => s + x, 0) / v.length; });
  const p25 = anosAbrangencia.map(a => percentil(porAnoAbrangencia[a], 25));
  const p75 = anosAbrangencia.map(a => percentil(porAnoAbrangencia[a], 75));

  document.getElementById('desc-abrangencia').textContent =
    `Média do Índice Geral entre os ${filtrados.length.toLocaleString('pt-BR')} municípios do recorte atual da barra lateral (bioma, região, estado, tipologias e Abrangência). A faixa sombreada mostra onde ficam os 50% de municípios mais próximos da média.`;

  // Linhas individuais de cada município, bem finas, atrás da média — com limite de segurança
  // pra não travar o navegador quando o recorte é muito amplo (ex.: sem nenhum filtro ativo).
  const LIMITE_LINHAS_INDIVIDUAIS = 3000;
  let datasetsIndividuais = [];
  if (filtrados.length <= LIMITE_LINHAS_INDIVIDUAIS) {
    datasetsIndividuais = filtrados.map(m => {
      const linhas = (SERIES_BY_CODE[m.code_muni] || []).filter(r => r[1] >= state.periodo[0] && r[1] <= state.periodo[1]);
      return { label: '_individual', data: linhas.map(r => ({ x: r[1], y: r[2] })), borderColor: '#1565c022', borderWidth: .7, pointRadius: 0, tension: .3, fill: false };
    });
    document.getElementById('desc-abrangencia').textContent += ` As linhas finas mostram cada um dos ${filtrados.length.toLocaleString('pt-BR')} municípios individualmente.`;
  } else {
    document.getElementById('desc-abrangencia').textContent += ` Linhas individuais ocultas neste recorte (${filtrados.length.toLocaleString('pt-BR')} municípios) para manter o desempenho — ative um filtro de Abrangência para reduzir o recorte e vê-las.`;
  }

  charts['chart-abrangencia'] = new Chart(document.getElementById('chart-abrangencia'), {
    type: 'line',
    data: {
      labels: anosAbrangencia,
      datasets: [
        ...datasetsIndividuais,
        { label: 'P75', data: p75, borderColor: 'transparent', pointRadius: 0, fill: false },
        { label: 'Faixa típica (P25–P75)', data: p25, borderColor: 'transparent', backgroundColor: '#1565c033', pointRadius: 0, fill: '-1' },
        { label: 'Média', data: media, borderColor: '#0d3e8a', backgroundColor: '#0d3e8a', tension: .3, pointRadius: 3, fill: false, borderWidth: 3 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { position: 'top', labels: { boxWidth: 10, font: { size: 11 }, filter: item => item.text !== 'P75' && item.text !== '_individual' } } },
      scales: { x: { type: 'linear', ticks: { stepSize: 1 } }, y: { min: 0, max: 1 } },
    },
  });

  // ---- gráfico de baixo: comparação dos municípios escolhidos individualmente (como antes) ----
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
  const notaHtml = ativos.length ? '' : `<div class="note">Este município não está classificado em nenhum programa territorial da SDR nem em nenhuma Rota de Integração — os filtros de Abrangência não afetam esta visão.</div>`;

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
    const anoAnterior = state.anoAnalise - 1;
    const rowAnterior = linhaAno(m.code_muni, anoAnterior);

    // Critério confirmado com o painel original: a tendência compara a CATEGORIA (Muito baixo..Muito alto),
    // não o valor numérico bruto — um município só "melhora" ou "piora" quando muda de faixa.
    const tendencia = (classeAtual, classeAnteriorVal) => {
      if (rowAnterior == null || classeAnteriorVal == null) return `<span class="trend trend-flat">Sem dado em ${anoAnterior}</span>`;
      if (classeAtual === classeAnteriorVal) return `<span class="trend trend-flat">→ Estável vs ${anoAnterior}</span>`;
      if (classeAtual > classeAnteriorVal) return `<span class="trend trend-up">▲ Melhorou vs ${anoAnterior}</span>`;
      return `<span class="trend trend-down">▼ Piorou vs ${anoAnterior}</span>`;
    };

    const classeGeral = classifica01(row[2]);
    const classeGeralAnterior = rowAnterior ? classifica01(rowAnterior[2]) : null;
    cardsEl.innerHTML = `
      <div class="idx-card geral" style="margin-bottom:10px;">
        <div class="top"><span class="name">Índice Geral</span><span class="badge-classe b${classeGeral}">${CLASS_LABELS[classeGeral]}</span></div>
        <div class="val">${row[2].toFixed(3)}</div>
        <div class="txt">Avaliação geral da competitividade regional municipal (escala 0 a 1)</div>
        ${tendencia(classeGeral, classeGeralAnterior)}
      </div>
      <div class="kpi-grid">
        ${EIXOS.map(e => `
          <div class="idx-card">
            <div class="top"><span class="name">${e.nome}</span><span class="badge-classe b${row[e.col]}">${CLASS_LABELS[row[e.col]]}</span></div>
            <div class="txt">${e.desc}</div>
            ${tendencia(row[e.col], rowAnterior ? rowAnterior[e.col] : null)}
          </div>`).join('')}
      </div>
    `;
  }


  destroyChart('chart-subindices');
  const coresEixo = { 2: '#2f5fe0', 3: '#1f8a5b', 4: '#c23a3a', 5: '#e6b800', 6: '#7a5cff', 7: '#0aa5b0', 8: '#e07a3f', 9: '#a340c9' };
  const nomesCol = { 2: 'Índice Geral', 3: 'Ambiental', 4: 'Social', 5: 'Infraestrutura', 6: 'Produtivo', 7: 'Institucional', 8: 'Educação', 9: 'Inovação' };
  const colValor = { 3: 10, 4: 11, 5: 12, 6: 13, 7: 14, 8: 15, 9: 16 }; // categoria (0-4) -> coluna do valor contínuo (0-1) real
  const datasets = [2, 3, 4, 5, 6, 7, 8, 9].map(col => ({
    label: nomesCol[col], data: serieCompleta.map(r => ({ x: r[1], y: col === 2 ? r[2] : r[colValor[col]] })),
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

/* --------------------------------- views (cont.) ---------------------------- */

function renderMetodologia(main) {
  const eixos = [
    ['Ambiental', 'Emissões de CO₂, cobertura vegetal, índice de aridez, disponibilidade hídrica e ocorrência de desastres naturais.'],
    ['Inovação', 'Registro de patentes, conectividade digital e acesso a tecnologias de informação e comunicação.'],
    ['Desenvolvimento Social', 'Saúde, assistência social e condições gerais de vida da população.'],
    ['Infraestrutura Econômica e Urbana', 'Saneamento, abastecimento de água, transporte, energia e demais serviços urbanos.'],
    ['Desenvolvimento Produtivo', 'PIB, renda per capita, mercado de trabalho formal, estrutura empresarial e inserção comercial.'],
    ['Institucional', 'Arrecadação própria, dependência de transferências intergovernamentais e gestão fiscal.'],
    ['Educação', 'Desempenho escolar, distorção idade-série, abandono e infraestrutura educacional.'],
  ];

  main.innerHTML = `
    <div class="titlebar"><h1>Metodologia</h1><div class="sub">Como o IBrCRM é calculado, quem o desenvolveu e onde encontrar a documentação completa</div></div>

    <div class="card meta-secao">
      <h3>Sobre o índice</h3>
      <p>O IBrCRM (Índice Brasileiro de Competitividade Regional Municipal) mede a competitividade regional dos municípios
      brasileiros a partir de sete dimensões, combinando técnicas de aprendizado de máquina e estatística multivariada.
      O índice foi desenvolvido pelo LEAP (Laboratório de Economia e Avaliação de Políticas Públicas) da UFPB
      (Universidade Federal da Paraíba), com inspiração metodológica em iniciativas internacionais como o
      Regional Competitiveness Index da Comissão Europeia e o Global Sustainable Competitiveness Index.</p>
      <p><b>Cobertura:</b> 5.565 municípios brasileiros · série histórica de 2010 a 2023.</p>
    </div>

    <div class="card meta-secao">
      <h3>Os sete eixos</h3>
      <div class="eixo-grid">
        ${eixos.map(([nome, desc]) => `<div class="eixo-item"><b>${nome}</b><p>${desc}</p></div>`).join('')}
      </div>
    </div>

    <div class="card meta-secao">
      <h3>Como o índice é calculado</h3>
      <p>Cada eixo parte de um conjunto amplo de indicadores candidatos. O algoritmo <b>Boruta</b> seleciona
      estatisticamente quais desses indicadores realmente contribuem para explicar a competitividade em cada eixo,
      descartando os redundantes ou irrelevantes. Os indicadores selecionados são então combinados por
      <b>Análise Fatorial Confirmatória (CFA)</b>, que define o peso de cada um dentro do eixo — só entram com peso
      as variáveis com carga fatorial acima de 0,40. Os sete eixos, por fim, entram com peso igual (1/7 cada) na
      composição do índice geral.</p>
      <p>Antes da modelagem, os dados passam por tratamento de valores faltantes (por tendência temporal do próprio
      município ou por média dos municípios vizinhos), tratamento de outliers por winsorização e normalização
      Min-Max, garantindo que municípios de portes e regiões diferentes sejam comparáveis.</p>
    </div>

    <div class="card meta-secao">
      <h3>Limitações conhecidas</h3>
      <p>Seis municípios criados por desmembramento posterior a 2010 (Boa Esperança do Norte-MT, Mojuí dos Campos-PA,
      Pescaria Brava-SC, Balneário Rincão-SC, Pinto Bandeira-RS e Paraíso das Águas-MS) não constam na série do
      índice, pois não existiam como entidade própria no início do período coberto.</p>
    </div>
  `;
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
