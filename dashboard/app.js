// Token Radar dashboard: renders the board from the data script (window.RADAR),
// with search, category and chain filters, a watchlist switch, a pre-token /
// live-token switch, sortable columns and a detail view for every protocol.
// The page makes no network request: all of its data arrives in data.js.
// The fitted model, its out-of-sample validation and the farm $/h figures
// are rendered from the same data, and the page recomputes every row from
// the fit to prove the board matches the figures behind it.

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

function dollars(value) {
  if (value == null) return '—';
  return (value < 0 ? '-$' : '$') + Math.abs(value).toFixed(2);
}

function perHourText(value) {
  if (value == null) return '—';
  return (value < 0 ? '-$' : '$') + Math.abs(value).toFixed(2) + '/h';
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

// ---------------------------------------------------------------- the fitted model

// The page's own recompute of a row from the figures data.js carries: the
// fitted size curve (alpha + beta on log TVL), the shrunk family offset,
// and the bounded growth, maturity and breadth multipliers. The same
// formula, in the same order, as the model's own pricing.
var familyMap = null;
function fitFamily(category) {
  if (!familyMap) {
    familyMap = {};
    (DATA.fit.family || []).forEach(function (f) { familyMap[f.category] = f.offset; });
  }
  return category != null && familyMap[category] != null ? familyMap[category] : 0;
}

function multipliers(row) {
  var m = DATA.model;
  var growth = row.change_7d == null ? 0 : row.change_7d;
  growth = Math.min(m.growth_cap, Math.max(m.growth_floor, growth));
  var g = 1 + (growth / 100) * m.growth_weight;
  var age = row.age_days == null ? m.unknown_age_days : row.age_days;
  var mat = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
  var extra = Math.min(Math.max((row.chains || []).length - 1, 0), m.breadth_max_extra);
  var b = 1 + m.breadth_step * extra;
  return { growth: g, maturity: mat, breadth: b };
}

function recompute(row) {
  var fit = DATA.fit;
  var size = fit.alpha + fit.beta * Math.log10(row.tvl_usd / 1e8);
  var mult = multipliers(row);
  var logValue = size + fitFamily(row.category) + Math.log10(mult.growth * mult.maturity * mult.breadth);
  return Math.max(1, Math.round(Math.pow(10, logValue)));
}

// The page's own farm economics for a row, from the same assumptions as
// the model: the airdrop is airdrop_pct of the implied value, shared by
// TVL, times the activity boost; gas is the first transaction, the setup,
// and one small transaction a week; hands-on time is the steps' minutes.
function farmEcon(row, implied) {
  var m = DATA.model;
  var size = row.tvl_usd >= 5000000000 ? 250 : row.tvl_usd >= 1000000000 ? 150 : row.tvl_usd >= 100000000 ? 100 : 50;
  var hold = row.age_days == null ? 30 : row.age_days < 180 ? 60 : row.age_days < 365 ? 45 : 30;
  var chain = row.chains && row.chains.length > 0 ? row.chains[0] : 'its main chain';
  var gas = chain === 'Ethereum' ? 8 : 1;
  var weeks = Math.ceil(hold / 7);
  var gasTotal = m.gas_first_tx_usd + gas + gas * weeks;
  var expected = implied * m.airdrop_pct * (size / row.tvl_usd) * m.activity_boost;
  var net = expected - gasTotal;
  var hands = (35 + 10 * weeks) / 60;
  var perHour = net / hands;
  return {
    capital: size, hold: hold, weeks: weeks, expected: expected, gas: gasTotal,
    net: net, hands: hands, perHour: perHour,
    verdict: perHour >= m.farm_usd_per_hour ? 'Farm' : perHour >= m.marginal_usd_per_hour ? 'Marginal' : 'Skip',
  };
}

// Recompute every row in the page and count how many match board.json:
// the implied value, and the farm $/h to the cent.
function recheckAll() {
  var match = 0;
  DATA.rows.forEach(function (r) {
    var implied = recompute(r);
    var econ = farmEcon(r, implied);
    var perHour = Math.round(econ.perHour * 100) / 100;
    if (implied === r.implied_value_usd && perHour === r.farm_econ.usd_per_hour) match++;
  });
  return { match: match, total: DATA.rows.length };
}

function renderModel() {
  var fit = DATA.fit;
  var v = fit.validation;
  $('formula').textContent = 'log\u2081\u2080 value = ' + fit.alpha.toFixed(2) + ' + ' + fit.beta.toFixed(2)
    + ' \u00b7 log\u2081\u2080(TVL / $100M) + family + growth + age'
    + '  — fitted on ' + fit.n_live + ' traded protocols (residual SD ' + fit.resid_sd.toFixed(2) + ' in log\u2081\u2080).';
  $('validation').textContent = 'Leave-one-out on ' + v.loo_n + ' traded protocols, refitting every fold: '
    + 'median miss ' + v.median_miss.toFixed(2) + '\u00d7 (old category-median model ' + v.baseline_median_miss.toFixed(2) + '\u00d7); '
    + Math.round(v.within_3x * 100) + '% within 3\u00d7 (was ' + Math.round(v.baseline_within_3x * 100) + '%); '
    + 'rank correlation ' + v.rank_corr.toFixed(2) + ' (was ' + v.baseline_rank_corr.toFixed(2) + ').';
  var check = recheckAll();
  $('recheck').textContent = 'Re-run in your browser: ' + check.match + '/' + check.total + ' rows match board.json.';
}

// Scatter plot: traded protocols, log market cap against log TVL, with the
// fitted curve. Drawn from the fit points data.js carries.
function renderScatter() {
  var fit = DATA.fit;
  var pts = DATA.fit_points || [];
  var svg = $('scatter');
  if (!pts.length) { svg.innerHTML = ''; return; }
  var W = 560, H = 260, L = 52, R = 14, T = 26, B = 30;
  var xs = pts.map(function (p) { return Math.log10(p.tvl_usd / 1e8); });
  var ys = pts.map(function (p) { return Math.log10(p.mcap_usd); });
  var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
  var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
  var padX = (x1 - x0) * 0.08 + 0.1, padY = (y1 - y0) * 0.08 + 0.1;
  x0 -= padX; x1 += padX; y0 -= padY; y1 += padY;
  function px(x) { return L + (x - x0) / (x1 - x0) * (W - L - R); }
  function py(y) { return T + (1 - (y - y0) / (y1 - y0)) * (H - T - B); }
  var out = '';
  out += '<line x1="' + L + '" y1="' + (H - B) + '" x2="' + (W - R) + '" y2="' + (H - B) + '" stroke="#cfd6cc"/>';
  out += '<line x1="' + L + '" y1="' + T + '" x2="' + L + '" y2="' + (H - B) + '" stroke="#cfd6cc"/>';
  var xTicks = [[-1, '$10M'], [0, '$100M'], [1, '$1B'], [2, '$10B']];
  xTicks.forEach(function (t) {
    if (t[0] < x0 || t[0] > x1) return;
    out += '<text x="' + px(t[0]).toFixed(1) + '" y="' + (H - 10) + '" font-size="11" fill="#64756a" text-anchor="middle">' + t[1] + '</text>';
    out += '<line x1="' + px(t[0]).toFixed(1) + '" y1="' + (H - B) + '" x2="' + px(t[0]).toFixed(1) + '" y2="' + (H - B + 4) + '" stroke="#64756a"/>';
  });
  var yTicks = [[6, '$1M'], [7, '$10M'], [8, '$100M'], [9, '$1B'], [10, '$10B']];
  yTicks.forEach(function (t) {
    if (t[0] < y0 || t[0] > y1) return;
    out += '<text x="' + (L - 6) + '" y="' + (py(t[0]) + 4).toFixed(1) + '" font-size="11" fill="#64756a" text-anchor="end">' + t[1] + '</text>';
    out += '<line x1="' + (L - 4) + '" y1="' + py(t[0]).toFixed(1) + '" x2="' + L + '" y2="' + py(t[0]).toFixed(1) + '" stroke="#64756a"/>';
  });
  pts.forEach(function (p) {
    out += '<circle cx="' + px(Math.log10(p.tvl_usd / 1e8)).toFixed(1) + '" cy="' + py(Math.log10(p.mcap_usd)).toFixed(1) + '" r="3" fill="#0b6e4f" opacity="0.55"/>';
  });
  var lx0 = px(x0), ly0 = py(fit.alpha + fit.beta * x0);
  var lx1 = px(x1), ly1 = py(fit.alpha + fit.beta * x1);
  out += '<line x1="' + lx0.toFixed(1) + '" y1="' + ly0.toFixed(1) + '" x2="' + lx1.toFixed(1) + '" y2="' + ly1.toFixed(1) + '" stroke="#17251d" stroke-width="2"/>';
  out += '<text x="' + L + '" y="14" font-size="12" font-weight="650" fill="#17251d">log\u2081\u2080 mcap = ' + fit.alpha.toFixed(2) + ' + ' + fit.beta.toFixed(2) + ' \u00b7 log\u2081\u2080(TVL/$100M)</text>';
  svg.innerHTML = out;
  $('scatter-caption').textContent = 'Each dot is one of the ' + pts.length + ' traded protocols in this snapshot; the line is the fitted curve. Market cap rises with TVL, but with wide scatter — the fit is a pricing guide, not a prediction.';
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
    var farm = '<td class="num">—</td><td>—</td>';
    if (!v.live && v.row.farm_econ) {
      var e = v.row.farm_econ;
      farm = '<td class="num">' + esc(perHourText(e.usd_per_hour)) + '</td>'
        + '<td><span class="verdict verdict-' + e.verdict.toLowerCase() + '">' + esc(e.verdict) + '</span></td>';
    }
    var cls = state.selected === v.slug ? ' class="selected"' : '';
    return '<tr data-slug="' + esc(v.slug) + '"' + cls + '>'
      + '<td class="num">' + v.rank + '</td>'
      + '<td><div class="name">' + esc(v.name) + '</div><div class="sub">' + esc(v.category || 'Uncategorised') + ' on ' + esc(chainList(v, 2)) + '</div></td>'
      + '<td class="num">' + money(v.tvl_usd) + '</td>'
      + '<td class="num">' + pct + '</td>'
      + '<td class="num">' + ageText(v.age_days) + '</td>'
      + '<td><span class="value-cell"><span class="bar"><i style="width:' + width + '%"></i></span><span>' + money(v.value) + '</span></span></td>'
      + farm
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
    var mult = multipliers(r);
    var famNote = r.family_n === 0
      ? '<span class="note">(too few live comps)</span>'
      : '<span class="note">(' + r.family_n + ' live in ' + esc(r.category || '') + ')</span>';
    var again = money(recompute(r));
    var e = r.farm_econ;
    html += '<p class="rank-line">Rank ' + r.rank + ' of ' + DATA.board_size + '</p>'
      + '<h2>' + esc(r.name) + '</h2>'
      + '<p class="chains">' + esc(r.category || 'Uncategorised') + ' on ' + esc((r.chains || []).join(', ')) + '</p>'
      + '<h3>Implied value</h3><dl>'
      + kvRow('TVL', money(r.tvl_usd))
      + kvRow('Size curve', 'log\u2081\u2080 ' + r.size_log10.toFixed(2) + ' <span class="note">(' + DATA.fit.alpha.toFixed(2) + ' + ' + DATA.fit.beta.toFixed(2) + ' \u00b7 log\u2081\u2080 TVL/$100M)</span>')
      + kvRow('Family offset', (r.family_offset >= 0 ? '+' : '') + r.family_offset.toFixed(2) + ' ' + famNote)
      + kvRow('Seven-day growth', pctText(r.change_7d) + ' <span class="note">(\u00d7' + mult.growth.toFixed(2) + ')</span>')
      + kvRow('Age with no token', ageText(r.age_days) + ' <span class="note">(\u00d7' + mult.maturity.toFixed(2) + ')</span>')
      + kvRow('Chains', r.chains.length + ' <span class="note">(\u00d7' + mult.breadth.toFixed(2) + ')</span>')
      + kvRow('Implied value', money(r.implied_value_usd))
      + '</dl>'
      + '<p class="why">Rank ' + r.rank + ' because its ' + money(r.tvl_usd) + ' of TVL sits on the fitted curve at log\u2081\u2080 ' + r.size_log10.toFixed(2)
      + ', adjusted ' + (r.family_offset >= 0 ? '+' : '') + r.family_offset.toFixed(2) + ' for its family, moved ' + pctText(r.change_7d)
      + ' in seven days, has run ' + ageText(r.age_days) + ' with no token, and reaches ' + r.chains.length + ' chains. '
      + 'Model ' + DATA.model_version + ' fits the curve to this snapshot\u2019s traded protocols and scores every protocol with the same function; '
      + 'this page recomputes the row from the same figures behind board.json (about ' + again + '). The figure is an estimate, not a price.</p>'
      + '<h3>Farm economics</h3><dl>'
      + kvRow('Expected airdrop value', dollars(e.expected_usd))
      + kvRow('Gas (setup + weekly)', dollars(e.gas_usd))
      + kvRow('Net', dollars(e.net_usd))
      + kvRow('Hands-on time', e.hands_hours.toFixed(1) + ' h')
      + kvRow('Farm $/h', perHourText(e.usd_per_hour) + ' <span class="note">(' + esc(e.verdict) + ')</span>')
      + '</dl>'
      + '<p class="why">The airdrop is assumed to be 10% of the implied value, shared by TVL, times a 10\u00d7 activity boost for a hands-on farmer. '
      + 'Capital $' + e.capital_usd + ', held ' + e.hold_days + ' days. Farm means $15/h or more, Marginal $5–15/h, Skip below $5/h.</p>'
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
    $('rows').innerHTML = '<tr><td colspan="9">No data: data.js did not load.</td></tr>';
    $('row-count').textContent = '0 rows shown';
    return;
  }
  renderHead();
  renderModel();
  renderScatter();
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
