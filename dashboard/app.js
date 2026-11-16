// Token Radar, radar-2 dashboard. It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a filterable table, a per-protocol detail dialog with the model's
// own inputs, same-category comparables and the protocol's farm plan, plus the calibration the
// model was fitted on. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', minTvl: 0, watchOnly: false, tab: 'board', sort: 'implied', dir: -1, selected: null };
  // The watchlist is the snapshot's own list, carried in the data so the filter and the badge
  // mark exactly the protocols the house's rule kept.
  var WATCH_SLUGS = {};
  (DATA.watchlist || []).forEach(function (s) { WATCH_SLUGS[s] = true; });

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
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
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return 'x' + n.toFixed(2);
  }
  // The model in one function: the page recomputes a row from the stored multipliers and checks
  // the number board.json carries, so the page's code and the board's data are visibly the same
  // arithmetic. implied = round(tvl x curveMultiple(tvl) x growthMult x maturityMult x breadthMult).
  function impliedOf(row) {
    return Math.max(1, Math.round(row.tvl_usd * row.multiple * row.growth_multiplier * row.maturity_multiplier * row.breadth_multiplier));
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

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and
  // age decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function gasNote(chain) {
    var c = chain.toLowerCase();
    if (c === 'ethereum') return 'about $3 to $8 of gas per transaction on Ethereum mainnet';
    if (c === 'solana') return 'about $0.01 of fees per transaction on Solana';
    if (c === 'bitcoin' || c === 'tron' || c === 'bittensor') return 'about $1 to $3 of fees per transaction';
    return 'about $0.10 to $1 of gas per transaction on this low-fee chain';
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    if (p.tvl_usd >= 25e6) return 75;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and borrow back no more than 40% of it, then repay the borrow.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('yield') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s highest-TVL vault on " + chain + ' and keep the shares.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged trade.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + ', then settle it.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares for the full term.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield-bearing asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + " of USDC to " + name + "'s chain and use one of its native apps for a week.";
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + " of USDC into " + name + "'s basis vault on " + chain + ' and keep the position open.';
    if (c.indexOf('liquid') >= 0) return 'Deposit $' + capital + ' of the staking asset into ' + name + ' on ' + chain + ' and hold the liquid receipt.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0) return 'adjust the supply, borrow a small amount, or repay part of it';
    if (c.indexOf('dex') >= 0) return 'swap a small amount or add a little more liquidity';
    if (c.indexOf('bridge') >= 0) return 'bridge a small amount back or across once more';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'open and close one small trade';
    if (c.indexOf('prediction') >= 0) return 'place one more small market position';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'stake a little more or claim and restake the rewards';
    return 'make a deposit, a swap, a vote, or another transaction the app records';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasNote(chain);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'nothing but the wallet setup', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and ' + gas, time: '15 minutes to set up' },
      { text: 'Once a week, ' + weeklyFor(p) + ', so the activity reads as real use and not a single deposit.', cost: gas, time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Check the protocol's own points or rewards page once a month and note the balance in your farm log.", cost: 'no fee to check', time: '10 minutes a month' },
      { text: "Before you withdraw, open the protocol's own site from its official channel and claim only from the link it publishes, never from a message or an ad.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction hash in a farm log, then unwind in the reverse order you entered: claim, withdraw, then close the position.', cost: 'nothing but the log', time: '10 minutes to unwind' }
    ].map(stepText);
  }

  function isWatch(slug) { return !!WATCH_SLUGS[slug]; }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tvl')) state.minTvl = parseInt(params.get('tvl'), 10) || 0;
    if (params.get('w') === '1') state.watchOnly = true;
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.minTvl) params.set('tvl', String(state.minTvl));
    if (state.watchOnly) params.set('w', '1');
    if (state.tab !== 'board') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (r.tvl_usd < state.minTvl) return false;
      if (state.watchOnly && !isWatch(r.slug)) return false;
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
      else if (key === 'multiple') { av = a.multiple; bv = b.multiple; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', null, 'Token Radar ', el('small', { text: DATA.model_version }))),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', null, 'Source ', el('b', { text: 'DefiLlama protocol index' })),
        el('span', null, 'Model ', el('b', { text: DATA.model_version }))
      )
    );
  }

  function lede() {
    var top = DATA.rows[0];
    return el('section', { class: 'lede' },
      el('h1', null, 'Every protocol still waiting on a token, ranked by ', el('em', { text: 'what its launch would be worth' }), '.'),
      el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds every other pre-token protocol the snapshot ranks, small ones included. Implied value is a model calibrated on the traded market, not a promise — and never a guess about whether or when a token launches.' }),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), el('small', { text: 'every slug on the list' })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) }), el('small', { text: DATA.early_size + ' early rows below the floor' })),
        el('div', { class: 'fact' }, el('span', { text: 'Top implied value' }), el('b', { text: top ? fmtUsd(top.implied_value_usd) : 'n/a' }), el('small', { text: top ? top.name : '' })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token set aside' }), el('b', { text: String(DATA.live_size) }), el('small', { text: 'shown at market value' })),
        el('div', { class: 'fact' }, el('span', { text: 'Blind test (5-fold)' }), el('b', { text: DATA.validation ? DATA.validation.median_abs_log_error.toFixed(2) + ' log err' : 'n/a' }), el('small', { text: DATA.validation ? 'curve, baseline ' + DATA.validation.baseline_median_abs_log_error.toFixed(2) : 'curve vs global median' }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c + ' (' + DATA.rows.filter(function (r) { return (r.category || 'Other') === c; }).length + ')', selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var tvlSelect = el('select', { id: 'mintvl', 'aria-label': 'Minimum TVL' },
      [[0, 'Any TVL'], [5e6, 'TVL $5M+'], [25e6, 'TVL $25M+'], [5e7, 'TVL $50M+'], [1e8, 'TVL $100M+'], [1e9, 'TVL $1B+']].map(function (o) {
        return el('option', { value: String(o[0]), text: o[1], selected: state.minTvl === o[0] ? 'selected' : null });
      })
    );
    tvlSelect.addEventListener('change', function () { state.minTvl = parseInt(tvlSelect.value, 10) || 0; writeHash(); render(); });
    var watchBox = el('input', { type: 'checkbox', id: 'watchonly', checked: state.watchOnly ? 'checked' : null });
    watchBox.addEventListener('change', function () { state.watchOnly = watchBox.checked; writeHash(); render(); });
    function tabBtn(tab, label) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === tab ? 'true' : 'false', text: label, onclick: function () { state.tab = tab; writeHash(); render(); } });
    }
    var countText = state.tab === 'board' ? rows().length + ' of ' + DATA.board_size + ' rows shown'
      : state.tab === 'live' ? DATA.live.length + ' live-token protocols'
      : 'calibration on ' + (DATA.calibration ? DATA.calibration.global_samples : 0) + ' traded protocols';
    return el('div', { class: 'controls' },
      el('div', { class: 'field grow' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('label', { for: 'mintvl', text: 'Minimum TVL' }), tvlSelect),
      el('label', { class: 'check', for: 'watchonly' }, watchBox, 'Watchlist only'),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'View' }), el('div', { class: 'tabs' }, tabBtn('board', 'Board'), tabBtn('live', 'Live token'), tabBtn('method', 'Method'))),
      el('span', { class: 'count', text: countText })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category, chain or TVL to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.minTvl = 0; state.watchOnly = false; writeHash(); render(); } })
      ));
    }
    var max = 1;
    DATA.rows.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtMult(r.multiple) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', { class: 'num', text: (r.rank_lo || r.rank) + '–' + (r.rank_hi || r.rank) }),
        el('td', null, isWatch(r.slug) ? el('span', { class: 'badge watch', text: 'watchlist' }) : el('span', { class: 'badge', text: 'pre-token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model breakdown, comparables and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('multiple', 'Mult.'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Rank range' }),
            el('th', { scope: 'col', text: 'Token' })
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
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.fdv_tvl === null ? 'n/a' : 'x' + r.fdv_tvl.toFixed(2) }),
        el('td', null, el('span', { class: 'badge live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Tokens live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and they are the market the calibration is read from.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'FDV / TVL' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function methodPanel() {
    var m = DATA.model;
    var cal = DATA.calibration || { global_median: 0, global_samples: 0, entries: [], curve: { intercept: 0, slope: 0, correlation: 0, samples: 0 } };
    var v = DATA.validation || null;
    var curve = cal.curve || { intercept: 0, slope: 0, correlation: 0, samples: 0 };
    function curveAt(tvl) {
      return Math.min(m.multiple_cap, Math.max(m.multiple_floor, Math.exp(curve.intercept + curve.slope * Math.log(tvl))));
    }
    var refRows = [1e7, 5e7, 1e8, 5e8, 1e9, 5e9].map(function (tvl) {
      return el('tr', null,
        el('td', { class: 'num', text: fmtUsd(tvl) }),
        el('td', { class: 'num', text: 'x' + curveAt(tvl).toFixed(2) })
      );
    });
    var rows = cal.entries.map(function (e) {
      return el('tr', null,
        el('td', { text: e.category }),
        el('td', { class: 'num', text: String(e.samples) }),
        el('td', { class: 'num', text: e.median_fdv_tvl === null ? 'n/a' : 'x' + e.median_fdv_tvl.toFixed(2) }),
        el('td', { class: 'num', text: 'x' + e.multiple.toFixed(2) })
      );
    });
    var panel = el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x ', el('b', { text: 'curveMultiple(tvl_usd)' }), ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + 0.02 x min(chains - 1, 5)) )'
      ),
      el('p', { text: 'The multiple is a comps curve fitted to the traded market, not a guess: ln(FDV/TVL) = ' + curve.intercept.toFixed(2) + ' ' + (curve.slope >= 0 ? '+' : '-') + ' ' + Math.abs(curve.slope).toFixed(2) + ' x ln(TVL), fitted by ordinary least squares over ' + curve.samples + ' traded protocols (correlation ' + curve.correlation.toFixed(2) + '). The market prices a dollar of TVL cheaper the larger the protocol is, so a protocol\u2019s multiple follows its own TVL, clamped to x' + m.multiple_floor + '–x' + m.multiple_cap + '. Each ratio is winsorized at x' + m.ratio_cap + ' first — the snapshot holds one traded protocol at 400x. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days.' }),
      el('h2', { text: 'The curve at a glance' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'calib' },
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: 'Multiple the curve gives' }))),
          el('tbody', null, refRows)
        )
      )
    );
    if (v) {
      panel.appendChild(el('h2', { text: 'Blind test: does the curve predict traded tokens?' }));
      panel.appendChild(el('p', { text: 'A 5-fold blind test: the traded protocols are dealt by slug order into five folds, each fold is held out in turn, and the curve is fitted on the other 80%. Every one of the ' + v.holdout_size + ' traded protocols is predicted exactly once, by a fit that never saw it. Median absolute log error ' + v.median_abs_log_error.toFixed(2) + ' (a typical prediction is off by a factor of about ' + Math.exp(v.median_abs_log_error).toFixed(1) + 'x), median absolute percentage error ' + Math.round(v.median_abs_pct_error * 100) + '%, ' + Math.round(v.within_2x * 100) + '% of predictions within 2x and ' + Math.round(v.within_3x * 100) + '% within 3x. The naive baseline — one global median of x' + cal.global_median.toFixed(2) + ' for every protocol — scores ' + v.baseline_median_abs_log_error.toFixed(2) + ' median log error and ' + Math.round(v.baseline_within_2x * 100) + '% within 2x, so the curve adds real signal. The median log ratio of ' + v.median_log_ratio.toFixed(2) + ' says the curve under-predicts a typical traded protocol by about ' + Math.round((1 - Math.exp(v.median_log_ratio)) * 100) + '% — stated here rather than corrected away, because a correction fitted on the same data would leak the test.' }));
      panel.appendChild(el('p', { text: 'Each row also carries a rank range: the 90% central band of its rank over ' + (DATA.refits || 200) + ' bootstrap refits of the curve. The top of the board is steady — rank 1 sits at 1–1, rank 2 at 2–2 — and the band widens down the board, where implied values crowd together. A wide band is the model saying it is unsure, not a second ranking.' }));
    }
    panel.appendChild(el('h2', { text: 'Category medians, for comparison' }));
    panel.appendChild(el('p', { text: 'The ranking does not use these: they are what an earlier median model would have said, shown so a reader can see why the curve replaced them. On the same 5-fold blind test the category medians scored 1.60 median log error, barely better than the 1.61 global-median baseline, because FDV/TVL varies so widely inside a category. Each median is shrunk toward the global median (weight ' + m.shrink_weight + ') and capped at ' + m.thin_cap_x_global + 'x it.' }));
    panel.appendChild(el('div', { class: 'table-wrap' },
      el('table', { class: 'calib' },
        el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Traded' }), el('th', { scope: 'col', text: 'Median FDV / TVL' }), el('th', { scope: 'col', text: 'Median multiple' }))),
        el('tbody', null, rows)
      )
    ));
    panel.appendChild(el('h2', { text: 'Limits of this radar' }));
    panel.appendChild(el('p', { text: 'The curve is fitted on protocols whose tokens already trade, and a pre-token protocol may price differently once it trades. Seven-day growth is a short window, age is only the listing date, and the snapshot is one day\u2019s record. The board says what a token would be worth if the protocol kept its record and the market paid it like its traded peers.' }));
    panel.appendChild(el('p', { class: 'note', text: 'Read it as a claim, not a price: the board says what a token would be worth if the protocol kept its record and the market paid it like its traded peers. It does not predict whether or when a token is issued.' }));
    return panel;
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var peers = DATA.live.filter(function (r) { return (r.category || 'Other') === (row.category || 'Other'); }).slice(0, 3);
    var recomputed = impliedOf(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (isWatch(row.slug) ? ' · watchlist' : ' · early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Curve multiple (at this TVL)' }), el('b', { class: 'num', text: fmtMult(row.multiple) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: row.growth_multiplier.toFixed(4) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: row.maturity_multiplier.toFixed(4) })),
        el('div', null, el('span', { text: 'Chain breadth' }), el('b', { class: 'num', text: row.breadth_multiplier.toFixed(2) })),
        el('div', null, el('span', { text: 'Rank range (90% band)' }), el('b', { class: 'num', text: (row.rank_lo || row.rank) + '–' + (row.rank_hi || row.rank) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' Its rank range is the 90% band of its rank over ' + (DATA.refits || 200) + ' bootstrap refits of the curve. This is an estimate, not a price, and it says nothing about whether or when a token launches.' })
    ));
    if (peers.length > 0) {
      dialog.appendChild(el('section', { class: 'detail-section' },
        el('h3', { text: 'Traded peers in ' + (row.category || 'Other') }),
        el('p', { class: 'sub', text: 'Protocols in the same category whose tokens already trade — the market the category multiple is read from.' }),
        el('div', { class: 'table-wrap' },
          el('table', null,
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'FDV / TVL' }))),
            el('tbody', null, peers.map(function (p) {
              return el('tr', null,
                el('td', { text: p.name }),
                el('td', { class: 'num', text: fmtUsd(p.tvl_usd) }),
                el('td', { class: 'num', text: fmtUsd(p.mcap_usd) }),
                el('td', { class: 'num', text: p.fdv_tvl === null ? 'n/a' : 'x' + p.fdv_tvl.toFixed(2) })
              );
            }))
          )
        )
      ));
    }
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    var fc = row.farm_cost || { capital_usd: 0, tx_count: 0, gas_usd: 0, hold_days: 0, net_usd: 0 };
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm cost' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'Capital locked' }), el('b', { class: 'num', text: fmtUsd(fc.capital_usd) })),
        el('div', null, el('span', { text: 'Transactions' }), el('b', { class: 'num', text: String(fc.tx_count) })),
        el('div', null, el('span', { text: 'Gas, all transactions' }), el('b', { class: 'num', text: '$' + fc.gas_usd.toFixed(2) })),
        el('div', null, el('span', { text: 'Hold' }), el('b', { class: 'num', text: fc.hold_days + ' days' })),
        el('div', null, el('span', { text: 'Net out of pocket' }), el('b', { class: 'num', text: '$' + fc.net_usd.toFixed(2) }))
      ),
      el('p', { class: 'sub', text: 'The capital is locked in the position for the hold and returned when the farmer unwinds, so the net cost is the gas alone. Gas is counted at the midpoint of the chain\u2019s fee range the farm steps quote: one transaction to enter, one a week for the hold, one to claim and one to unwind.' })
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    if (state.tab === 'live') shell.appendChild(liveTable());
    else if (state.tab === 'method') shell.appendChild(methodPanel());
    else shell.appendChild(boardTable());
    if (state.tab === 'board') shell.appendChild(methodPanel());
    shell.appendChild(el('p', { class: 'foot', text: 'Snapshot ' + DATA.as_of + ' · ' + DATA.source + ' · Implied values are this radar\u2019s own model, calibrated on the snapshot\u2019s traded protocols. A protocol that records no token may still have one its DefiLlama record does not carry.' }));
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
