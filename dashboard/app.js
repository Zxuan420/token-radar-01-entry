// Token Radar's enhanced dashboard. Reads window.RADAR and renders ranked pre-token board,
// live token view, advanced filters (search, category, chain, watchlist-only, min TVL), sorting,
// detail drawer with full model breakdown and DefiLlama slug reference (no network/http URLs),
// and URL hash state persistence for reproducible views and screenshots.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  
  var state = {
    q: '',
    category: 'all',
    chain: 'all',
    watchlistOnly: false,
    minTvl: 0,
    tab: 'pre-token',
    sort: 'implied',
    dir: -1,
    selected: null
  };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.has('q')) state.q = params.get('q');
    if (params.has('category')) state.category = params.get('category');
    if (params.has('chain')) state.chain = params.get('chain');
    if (params.has('watchlist')) state.watchlistOnly = params.get('watchlist') === '1';
    if (params.has('min_tvl')) state.minTvl = Number(params.get('min_tvl')) || 0;
    if (params.has('tab')) state.tab = params.get('tab');
    if (params.has('sort')) state.sort = params.get('sort');
    if (params.has('dir')) state.dir = Number(params.get('dir')) || -1;
    if (params.has('p')) state.selected = params.get('p');
    if (params.has('detail')) state.selected = params.get('detail');
  }

  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchlistOnly) params.set('watchlist', '1');
    if (state.minTvl > 0) params.set('min_tvl', String(state.minTvl));
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.sort !== 'implied') params.set('sort', state.sort);
    if (state.dir !== -1) params.set('dir', String(state.dir));
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (!r.chains || r.chains.indexOf(state.chain) < 0)) return false;
      if (state.watchlistOnly && !r.watchlist) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'rank') { av = a.rank; bv = b.rank; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor. Implied value (radar-2) includes TVL, 7d growth, maturity, chain diversity, and category utility.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live tokens set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var allChains = [];
    DATA.rows.forEach(function (r) { if (r.chains) r.chains.forEach(function (c) { if (allChains.indexOf(c) < 0) allChains.push(c); }); });
    allChains.sort();

    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, slug, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });

    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });

    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      allChains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });

    var minTvlSelect = el('select', { id: 'min_tvl', 'aria-label': 'Minimum TVL' },
      el('option', { value: '0', text: 'Min TVL: Any', selected: state.minTvl === 0 ? 'selected' : null }),
      el('option', { value: '10000000', text: 'Min TVL: $10M+', selected: state.minTvl === 10000000 ? 'selected' : null }),
      el('option', { value: '50000000', text: 'Min TVL: $50M+ (Watchlist Floor)', selected: state.minTvl === 50000000 ? 'selected' : null }),
      el('option', { value: '100000000', text: 'Min TVL: $100M+', selected: state.minTvl === 100000000 ? 'selected' : null }),
      el('option', { value: '1000000000', text: 'Min TVL: $1B+', selected: state.minTvl === 1000000000 ? 'selected' : null })
    );
    minTvlSelect.addEventListener('change', function () { state.minTvl = Number(minTvlSelect.value) || 0; writeHash(); render(); });

    var watchCheckbox = el('input', { type: 'checkbox', id: 'watchlist', checked: state.watchlistOnly ? 'checked' : null });
    watchCheckbox.addEventListener('change', function () { state.watchlistOnly = watchCheckbox.checked; writeHash(); render(); });
    var watchLabel = el('label', { for: 'watchlist', class: 'check-label' }, watchCheckbox, el('span', { text: 'Watchlist only (40)' }));

    var preTab = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token Board', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } });
    var liveTab = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live Token View', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    var exportBtn = el('button', { type: 'button', class: 'button export-btn', text: 'Export CSV', onclick: exportCsv });

    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('label', { for: 'min_tvl', text: 'TVL Floor' }), minTvlSelect),
      el('div', { class: 'field checkbox-field' }, watchLabel),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'View mode' }), el('div', { class: 'tabs' }, preTab, liveTab)),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Data action' }), exportBtn),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' protocols shown' : DATA.live.length + ' live tokens' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } writeHash(); render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches the active filters' }),
        el('p', { text: 'Try clearing search terms, changing category or chain filters, or resetting TVL floor.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Reset all filters', onclick: function () {
          state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlistOnly = false; state.minTvl = 0; writeHash(); render();
        }})
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var badge = r.watchlist ? el('span', { class: 'badge watch', text: 'watchlist' }) : el('span', { class: 'badge early', text: 'early' });
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num' }, el('span', null, String(r.rank)), badge),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'pre-token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols ranked by radar-2 implied value. Click headers to sort or any row for model breakdown and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('rank', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d Growth'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied Value'),
            el('th', { scope: 'col', text: 'Status' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.join(', ') : 'unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'active token' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Live token protocols: these already trade on markets, so their market capitalization is actual market data rather than a model estimate.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market Cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How radar-2 implied value is computed' }),
      el('p', { class: 'sub', text: 'Implied value integrates TVL, 7-day TVL momentum (capped between ' + m.growth_floor + '% and +' + m.growth_cap + '%), protocol maturity (age since listing), multi-chain diversification bonus, and category utility weighting.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x ' + m.base_multiple + ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x chainMult x catMult )'
      ),
      el('p', { class: 'sub', text: 'The watchlist covers ' + DATA.watchlist_size + ' protocols meeting the floor ($' + Math.round(DATA.floor_usd / 1e6) + 'M TVL, no token), and the early radar adds ' + DATA.early_size + ' pre-token protocols below the floor (' + (DATA.watchlist_size + DATA.early_size) + ' total rows). Live-token protocols are indexed separately.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';

    var steps = [
      { text: 'Initialize a dedicated burner wallet holding only transaction gas and budgeted farm capital, keeping credentials secure.', cost: 'under $3 of gas for initialization', time: '5 minutes' },
      { text: 'Interact with ' + row.name + ' on ' + (row.chains && row.chains.length ? row.chains[0] : 'its main chain') + ' according to its ' + (row.category || 'general') + ' category requirements.', cost: '$50 to $250 capital + gas', time: '15 minutes setup' },
      { text: 'Perform recurring weekly interactions such as rebalancing, compounding rewards, or voting on governance proposals.', cost: '$2 to $4 weekly gas', time: '10 minutes weekly' },
      { text: 'Maintain the open position continuously for established epoch durations to qualify across snapshot windows.', cost: 'principal locked in position', time: '30 to 60 days retention' },
      { text: 'Verify eligibility strictly through official governance portals or audited links without interacting with phishing ads.', cost: 'zero fees for checking', time: '10 minutes review' },
      { text: 'Document wallet addresses, entry timestamps, transaction hashes, and exit plans thoroughly in a local activity log.', cost: 'no monetary cost', time: '5 minutes logging' }
    ].map(function(s) { return s.text + ' Cost: ' + s.cost + '. Time: ' + s.time + '.'; });

    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' (Watchlist)' : ' (Early Radar)') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));

    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied Value Breakdown (radar-2)' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: '7d Growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Tracked Age' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth Multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity Multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Chain Diversity Multiplier' }), el('b', { class: 'num', text: String(row.chain_multiplier) })),
        el('div', null, el('span', { text: 'Category Utility Multiplier' }), el('b', { class: 'num', text: String(row.category_multiplier) })),
        el('div', null, el('span', { text: 'Implied Value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'DefiLlama slug reference: ' + row.slug })
    ));

    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Concrete Farm Plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));

    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function exportCsv() {
    var list = state.tab === 'pre-token' ? sortedRows(rows()) : DATA.live;
    var headers = state.tab === 'pre-token'
      ? ['rank', 'protocol', 'slug', 'category', 'chains', 'tvl_usd', 'change_7d', 'age_days', 'implied_value_usd', 'watchlist', 'status']
      : ['status', 'protocol', 'slug', 'category', 'chains', 'tvl_usd', 'change_7d', 'mcap_usd'];
    
    var csvRows = [headers.join(',')];
    list.forEach(function (r) {
      var vals = state.tab === 'pre-token'
        ? [
            r.rank,
            '"' + (r.name || '').replace(/"/g, '""') + '"',
            '"' + (r.slug || '') + '"',
            '"' + (r.category || '').replace(/"/g, '""') + '"',
            '"' + (r.chains || []).join(';') + '"',
            r.tvl_usd,
            r.change_7d !== null ? r.change_7d : '',
            r.age_days !== null ? r.age_days : '',
            r.implied_value_usd,
            r.watchlist ? 'true' : 'false',
            'pre-token'
          ]
        : [
            'active token',
            '"' + (r.name || '').replace(/"/g, '""') + '"',
            '"' + (r.slug || '') + '"',
            '"' + (r.category || '').replace(/"/g, '""') + '"',
            '"' + (r.chains || []).join(';') + '"',
            r.tvl_usd,
            r.change_7d !== null ? r.change_7d : '',
            r.mcap_usd !== null ? r.mcap_usd : ''
          ];
      csvRows.push(vals.join(','));
    });

    var blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'token-radar-' + state.tab + '-' + DATA.as_of + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
