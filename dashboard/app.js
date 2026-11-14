// Token Radar dashboard: renders the board from the data script (window.RADAR),
// with search, category and chain filters, a watchlist switch, a pre-token /
// live-token switch, sortable columns and a detail view for every protocol.
// The page makes no network request: all of its data arrives in data.js.

var DATA = typeof window !== 'undefined' ? window.RADAR || null : null;

// ---------------------------------------------------------------- formatting

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(value) {
  if (value == null) return '—';
  if (value >= 1e9) return '$' + (value / 1e9).toFixed(2) + 'B';
  if (value >= 1e6) return '$' + (value / 1e6).toFixed(1) + 'M';
  if (value >= 1e3) return '$' + (value / 1e3).toFixed(1) + 'K';
  return '$' + Math.round(value);
}

function pctText(value) {
  if (value == null) return '—';
  return (value > 0 ? '+' : '') + value.toFixed(2) + '%';
}

function ageText(days) {
  if (days == null) return '—';
  if (days < 365) return days + 'd';
  return (days / 365).toFixed(1) + 'y';
}

function chainList(row, max) {
  var chains = row.chains || [];
  return chains.slice(0, max).join(', ') + (chains.length > max ? ', +' + (chains.length - max) : '');
}

// ---------------------------------------------------------------- farm plans

// The farm plan is built from the row's own record, never from a list of
// names: the first chain is the venue, the TVL sizes one position, the age
// sets how long the position is held, and the category picks the action.
// The table is read in order, so a category that matches two rules takes
// the first one, exactly as the model's own order has it.
var FARM_RULES = [
  { keys: ['lend', 'cdp', 'collateral'],
    act: function (name, chain, size) { return 'Supply $' + size + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.'; },
    week: 'Borrow a small amount against the deposit once a month, then repay it, so the position shows both sides.' },
  { keys: ['dex', 'yield', 'leveraged farm'],
    act: function (name, chain, size) { return 'Provide $' + size + ' of liquidity to ' + name + '\'s main pool on ' + chain + ' and keep the position open.'; },
    week: 'Swap a small amount through the pool each week so the wallet shows repeated use, not one deposit.' },
  { keys: ['bridge'],
    act: function (name, chain, size) { return 'Bridge $' + size + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.'; },
    week: 'Bridge a small amount back, or to a second chain, once a month so the wallet shows repeated use.' },
  { keys: ['staking', 'restak'],
    act: function (name, chain, size) { return 'Stake $' + size + ' of the chain\'s staking asset through ' + name + ' and keep the receipt.'; },
    week: 'Claim any rewards the position accrues and restake them once a month.' },
  { keys: ['perpetual', 'derivative'],
    act: function (name, chain, size) { return 'Deposit $' + size + ' of USDC as margin on ' + name + ' and open one small hedge.'; },
    week: 'Open and close one small hedge each week and keep the margin topped up.' },
  { keys: ['prediction'],
    act: function (name, chain, size) { return 'Fund $' + size + ' and place one market position on ' + name + '.'; },
    week: 'Settle one small market position each week and keep the balance funded.' },
  { keys: ['curator', 'allocator'],
    act: function (name, chain, size) { return 'Deposit $' + size + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.'; },
    week: 'Top up the vault or move between its strategies once a month.' },
  { keys: ['stable'],
    act: function (name, chain, size) { return 'Mint or deposit $' + size + ' of the stable asset through ' + name + ' on ' + chain + '.'; },
    week: 'Mint or redeem a small amount of the stable asset once a month.' },
  { keys: ['rwa'],
    act: function (name, chain, size) { return 'Mint $' + size + ' of the protocol\'s yield asset on ' + chain + ' and hold it.'; },
    week: 'Check the yield accrual once a month and compound it where the protocol allows.' },
  { keys: ['insurance'],
    act: function (name, chain, size) { return 'Buy $' + size + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.'; },
    week: 'Review the cover once a month and renew or adjust it before it expires.' },
];

var FARM_FALLBACK = {
  act: function (name, chain, size) { return 'Deposit $' + size + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.'; },
  week: 'Make one qualifying action each week, such as a deposit, a swap or a vote.',
};

function farmPlan(row) {
  var chain = row.chains && row.chains.length > 0 ? row.chains[0] : 'its main chain';
  var size = row.tvl_usd >= 5000000000 ? 250 : row.tvl_usd >= 1000000000 ? 150 : row.tvl_usd >= 100000000 ? 100 : 50;
  var hold = row.age_days == null ? 30 : row.age_days < 180 ? 60 : row.age_days < 365 ? 45 : 30;
  var gas = chain === 'Ethereum' ? 8 : 1;
  var cat = (row.category || '').toLowerCase();
  var rule = FARM_FALLBACK;
  for (var i = 0; i < FARM_RULES.length; i++) {
    var r = FARM_RULES[i];
    if (r.keys.some(function (k) { return cat.indexOf(k) !== -1; })) { rule = r; break; }
  }
  var steps = [
    { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.',
      cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
    { text: rule.act(row.name, chain, size),
      cost: '$' + size + ' of capital and about $' + gas + ' of gas', time: '15 minutes to set up' },
    { text: rule.week,
      cost: 'about $' + gas + ' of gas a week', time: '10 minutes a week' },
    { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.',
      cost: 'the $' + size + ' stays in the position', time: hold + ' days' },
    { text: 'Before you withdraw, open the protocol\'s own points or rewards page and claim only from the link it publishes.',
      cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
    { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.',
      cost: 'nothing but the log', time: '5 minutes' },
  ];
  return steps.map(function (s) {
    var line = s.text + ' Cost: ' + s.cost + '. Time: ' + s.time + '.';
    if (line.length > 600) line = line.slice(0, 596) + '...';
    return { text: s.text, cost: s.cost, time: s.time, line: line };
  });
}

// The page's own recompute of a row from the figures data.js carries:
// TVL times the category comp, the growth, maturity and breadth multipliers.
function recompute(row) {
  return Math.round(row.tvl_usd * row.comp_multiple * row.growth_multiplier * row.maturity_multiplier * row.breadth_multiplier);
}

// ---------------------------------------------------------------- state

var state = {
  mode: 'pre',          // 'pre' for the ranked board, 'live' for live-token rows
  query: '',
  category: '',
  chain: '',
  watchlistOnly: false,
  sortKey: 'rank',      // 'rank' or 'value'
  sortDir: 1,           // 1 ascending by the key, -1 descending
  selected: null,       // slug of the row whose detail is open, or null
};

function $(id) { return document.getElementById(id); }

// One uniform shape for both views, so the table and the detail panel share
// the same code. Live rows carry no age and no model figures: their value
// is the market cap the market already gives them.
function viewRows() {
  if (state.mode === 'live') {
    return DATA.live.map(function (r, i) {
      return {
        rank: i + 1, slug: r.slug, name: r.name, category: r.category,
        chains: r.chains, tvl_usd: r.tvl_usd, change_7d: r.change_7d,
        age_days: null, value: r.mcap_usd == null ? 0 : r.mcap_usd, live: true, row: r,
      };
    });
  }
  return DATA.rows.map(function (r) {
    return {
      rank: r.rank, slug: r.slug, name: r.name, category: r.category,
      chains: r.chains, tvl_usd: r.tvl_usd, change_7d: r.change_7d,
      age_days: r.age_days, value: r.implied_value_usd, live: false, row: r,
    };
  });
}

function visibleRows() {
  var watch = {};
  DATA.watchlist.forEach(function (s) { watch[s] = true; });
  var q = state.query.trim().toLowerCase();
  var list = viewRows().filter(function (v) {
    if (state.mode === 'pre' && state.watchlistOnly && !watch[v.slug]) return false;
    if (state.category && v.category !== state.category) return false;
    if (state.chain && (v.chains || []).indexOf(state.chain) === -1) return false;
    if (q) {
      var hay = (v.name + ' ' + (v.category || '') + ' ' + (v.chains || []).join(' ')).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
  var dir = state.sortDir;
  if (state.sortKey === 'value') list.sort(function (a, b) { return (a.value - b.value) * dir; });
  else list.sort(function (a, b) { return (a.rank - b.rank) * dir; });
  return list;
}

// ---------------------------------------------------------------- table

function renderTable() {
  var list = visibleRows();
  var max = 0;
  list.forEach(function (v) { if (v.value > max) max = v.value; });
  var html = list.map(function (v) {
    var pct = v.change_7d == null ? '<span>—</span>' : '<span class="' + (v.change_7d > 0 ? 'up' : v.change_7d < 0 ? 'down' : '') + '">' + esc(pctText(v.change_7d)) + '</span>';
    var width = max > 0 ? (v.value / max * 100).toFixed(1) : 0;
    var token = v.live
      ? '<span class="token-mark live"><span class="dot"></span>live token</span>'
      : '<span class="token-mark"><span class="dot"></span>no token</span>';
    var cls = state.selected === v.slug ? ' class="selected"' : '';
    return '<tr data-slug="' + esc(v.slug) + '"' + cls + '>'
      + '<td class="num">' + v.rank + '</td>'
      + '<td><div class="name">' + esc(v.name) + '</div><div class="sub">' + esc(v.category || 'Uncategorised') + ' on ' + esc(chainList(v, 2)) + '</div></td>'
      + '<td class="num">' + money(v.tvl_usd) + '</td>'
      + '<td class="num">' + pct + '</td>'
      + '<td class="num">' + ageText(v.age_days) + '</td>'
      + '<td><span class="value-cell"><span class="bar"><i style="width:' + width + '%"></i></span><span>' + money(v.value) + '</span></span></td>'
      + '<td>' + token + '</td></tr>';
  }).join('');
  $('rows').innerHTML = html;
  $('row-count').textContent = list.length + ' rows shown';
  $('empty').hidden = list.length !== 0;
  $('table-caption').textContent = state.mode === 'live'
    ? 'Live-token protocols, largest market cap first. Select a row for its market value.'
    : 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.';
  $('sort-value').textContent = state.mode === 'live' ? 'Market cap' : 'Implied value';
  $('sort-rank').textContent = 'Rank' + (state.sortKey === 'rank' ? (state.sortDir === 1 ? ' ↑' : ' ↓') : '');
  $('sort-value').textContent += state.sortKey === 'value' ? (state.sortDir === 1 ? ' ↑' : ' ↓') : '';
}

function fillOptions() {
  var cats = {};
  var chains = {};
  DATA.rows.concat(DATA.live).forEach(function (r) {
    if (r.category) cats[r.category] = true;
    (r.chains || []).forEach(function (c) { chains[c] = true; });
  });
  var catSel = $('category');
  Object.keys(cats).sort().forEach(function (c) {
    var o = document.createElement('option');
    o.value = c; o.textContent = c; catSel.appendChild(o);
  });
  var chainSel = $('chain');
  Object.keys(chains).sort().forEach(function (c) {
    var o = document.createElement('option');
    o.value = c; o.textContent = c; chainSel.appendChild(o);
  });
}

function renderHead() {
  $('meta').textContent = 'Snapshot ' + DATA.as_of + ' · DefiLlama protocol index · ' + DATA.model_version + ' model';
  $('headline').textContent = DATA.watchlist_size + ' watchlist protocols, ranked by implied value';
  $('stat-watchlist').textContent = DATA.watchlist_size + ' / ' + DATA.watchlist_size;
  $('stat-board').textContent = String(DATA.board_size);
  $('stat-early').textContent = String(DATA.early_size);
  $('stat-live').textContent = String(DATA.live_size);
}

// ---------------------------------------------------------------- detail

function kvRow(label, valueHtml) {
  return '<div><dt>' + esc(label) + '</dt><dd>' + valueHtml + '</dd></div>';
}

function openDetail(view) {
  var r = view.row;
  var html = '<button class="close-btn" type="button" id="detail-close">Close</button>';
  if (view.live) {
    html += '<p class="rank-line">Live token ' + view.rank + ' of ' + DATA.live.length + '</p>'
      + '<h2>' + esc(r.name) + '</h2>'
      + '<p class="chains">' + esc(r.category || 'Uncategorised') + ' on ' + esc((r.chains || []).join(', ')) + '</p>'
      + '<h3>Market value</h3><dl>'
      + kvRow('TVL', money(r.tvl_usd))
      + kvRow('Market cap', money(r.mcap_usd))
      + kvRow('Seven-day change', pctText(r.change_7d))
      + kvRow('Chains', String((r.chains || []).length))
      + '</dl>'
      + '<p class="why">This protocol already has a token that trades, so the board sets it aside and shows the market\u2019s own value instead of a model price.</p>';
  } else {
    var compNote = r.comp_category_n === 0
      ? '<span class="note">(global)</span>'
      : '<span class="note">(' + r.comp_category_n + ' live)</span>';
    var catNote = r.comp_category_n === 0
      ? ' (global median: too few live comps in this category)'
      : ' (' + r.comp_category_n + ' live comps)';
    var catPhrase = r.category ? 'the median for ' + r.category : 'the median across live protocols';
    var again = money(recompute(r));
    html += '<p class="rank-line">Rank ' + r.rank + ' of ' + DATA.board_size + '</p>'
      + '<h2>' + esc(r.name) + '</h2>'
      + '<p class="chains">' + esc(r.category || 'Uncategorised') + ' on ' + esc((r.chains || []).join(', ')) + '</p>'
      + '<h3>Implied value</h3><dl>'
      + kvRow('TVL', money(r.tvl_usd))
      + kvRow('Category comp', r.comp_multiple.toFixed(2) + 'x ' + compNote)
      + kvRow('Seven-day growth', pctText(r.change_7d))
      + kvRow('Age with no token', ageText(r.age_days))
      + kvRow('Chains', r.chains.length + ' <span class="note">(' + r.breadth_multiplier.toFixed(2) + 'x)</span>')
      + kvRow('Growth multiplier', r.growth_multiplier.toFixed(3))
      + kvRow('Maturity multiplier', r.maturity_multiplier.toFixed(4))
      + kvRow('Implied value', money(r.implied_value_usd))
      + '</dl>'
      + '<p class="why">Rank ' + r.rank + ' because its ' + money(r.tvl_usd) + ' of TVL is priced at ' + r.comp_multiple.toFixed(2) + 'x, ' + catPhrase + catNote + ', moved ' + pctText(r.change_7d) + ' in seven days, has run ' + ageText(r.age_days) + ' with no token, and reaches ' + r.chains.length + ' chains. '
      + 'Model ' + DATA.model_version + ' scores every protocol with the same function, and this page recomputes the row from the same figures behind board.json (about ' + again + '). The figure is an estimate, not a price.</p>'
      + '<h3>Farm plan</h3><ol>'
      + farmPlan(r).map(function (s) {
          return '<li><p class="step-text">' + esc(s.text) + '</p><p class="step-meta">Cost: ' + esc(s.cost) + '. Time: ' + esc(s.time) + '.</p></li>';
        }).join('')
      + '</ol>';
  }
  var detail = $('detail');
  detail.innerHTML = html;
  detail.hidden = false;
  $('scrim').hidden = false;
  state.selected = view.slug;
  renderTable();
}

function closeDetail() {
  $('detail').hidden = true;
  $('scrim').hidden = true;
  state.selected = null;
  renderTable();
}

// ---------------------------------------------------------------- events

function setMode(mode) {
  if (state.mode === mode) return;
  state.mode = mode;
  state.selected = null;
  $('mode-pre').setAttribute('aria-pressed', mode === 'pre' ? 'true' : 'false');
  $('mode-live').setAttribute('aria-pressed', mode === 'live' ? 'true' : 'false');
  $('watchlist-only').disabled = mode === 'live';
  closeDetail();
  renderTable();
}

function init() {
  if (!DATA) {
    $('rows').innerHTML = '<tr><td colspan="7">No data: data.js did not load.</td></tr>';
    $('row-count').textContent = '0 rows shown';
    return;
  }
  renderHead();
  fillOptions();
  $('search').addEventListener('input', function (e) { state.query = e.target.value; renderTable(); });
  $('category').addEventListener('change', function (e) { state.category = e.target.value; renderTable(); });
  $('chain').addEventListener('change', function (e) { state.chain = e.target.value; renderTable(); });
  $('watchlist-only').addEventListener('change', function (e) { state.watchlistOnly = e.target.checked; renderTable(); });
  $('mode-pre').addEventListener('click', function () { setMode('pre'); });
  $('mode-live').addEventListener('click', function () { setMode('live'); });
  $('sort-rank').addEventListener('click', function () {
    if (state.sortKey === 'rank') state.sortDir = -state.sortDir;
    else { state.sortKey = 'rank'; state.sortDir = 1; }
    renderTable();
  });
  $('sort-value').addEventListener('click', function () {
    if (state.sortKey === 'value') state.sortDir = -state.sortDir;
    else { state.sortKey = 'value'; state.sortDir = -1; }
    renderTable();
  });
  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest ? e.target.closest('tr') : null;
    if (!tr) return;
    var slug = tr.getAttribute('data-slug');
    var found = null;
    viewRows().forEach(function (v) { if (v.slug === slug) found = v; });
    if (found) openDetail(found);
  });
  $('detail').addEventListener('click', function (e) {
    if (e.target && e.target.id === 'detail-close') closeDetail();
  });
  $('scrim').addEventListener('click', closeDetail);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDetail(); });
  renderTable();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}
