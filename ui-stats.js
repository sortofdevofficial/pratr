'use strict';

/* ui-stats: live member, overclock and voice-activity channels, with inline SVG growth charts. */

function renderStats(ch) {
    const st = S.stats || {};
    const key = [ch.id, ch.sub, S.server && S.server.id, S.server && S.server.accent, st.day, st.members, st.online, st.voice, st.boosts, st.weekVoice, (st.series || []).length].join('|');
    paintOnce('stats', key, () => paintStats(ch));
}

function paintStats(ch) {
    const box = $('stats-page');
    box.textContent = '';
    if (!S.stats) {
        box.append(h('div', 'stat-loading', 'Reading this server’s numbers…'));
        return;
    }
    const st = S.stats, sub = ch.sub || 'live', colour = (S.server && cleanHex(S.server.accent)) || '#ff5a4e';
    const head = h('div', 'stat-head');
    const big = h('div', 'stat-big');
    const titles = { live: ['Members', 'People in this server right now'], boost: ['Overclocks', 'Every overclock this server has received'], voice: ['Voice this week', 'Time members spent in voice channels'] };
    const [label, blurb] = titles[sub] || titles.live;
    big.append(h('span', 'stat-label', label), h('strong', '', sub === 'voice' ? fmtDur(st.weekVoice || 0) : sub === 'boost' ? String(st.boosts || 0) : String(st.members || 0)), h('small', '', blurb));
    head.append(big);
    const chip = h('span', 'stat-live'); chip.innerHTML = '<i class="pdot on"></i>Live';
    head.append(chip);
    box.append(head);

    const tiles = h('div', 'stat-tiles');
    if (sub === 'live') {
        tiles.append(statTile('user', 'Online now', `${st.online || 0}/${st.members || 0}`), statTile('speaker', 'In voice', String(st.voice || 0)), statTile('chart', 'Last 30 days', deltaLabel(st, 'm')));
        box.append(tiles, chartCard('Member growth', st, 'm', colour, 'No members yet — the chart fills in as people join.'));
    } else if (sub === 'boost') {
        tiles.append(statTile('bolt', 'Perk tier', `${st.tier || 0}/6`), statTile('chart', 'Next perk', st.nextPerk ? `${st.nextPerk.n} · ${Math.max(0, st.nextPerk.at - st.boosts)} to go` : 'All perks unlocked'), statTile('user', 'Top boosters', String((st.topBoosters || []).length)));
        box.append(tiles, chartCard('Overclock growth', st, 'o', colour, 'No overclocks yet — boost the server to start the line.'));
        if ((st.topBoosters || []).length) box.append(peopleCard('Top boosters this month', st.topBoosters.map(b => ({ name: b.username, value: `${b.n} ✦` }))));
    } else {
        tiles.append(statTile('speaker', 'In voice now', String(st.voice || 0)), statTile('user', 'Members', String(st.members || 0)), statTile('chart', 'This week', fmtDur(st.weekVoice || 0)));
        box.append(tiles, peopleCard('Most time in voice', (st.topVoice || []).map(v => ({ name: v.username, value: fmtDur(v.t || 0) })), 'No voice sessions this week yet.'));
    }

    const foot = h('p', 'stat-foot');
    foot.append(h('span', '', `Updated ${fmtTime(Math.floor(Date.now() / 1000))} · refreshes every 30s`));
    box.append(foot);
}

function statTile(icon, label, value) {
    const t = h('div', 'stat-tile');
    const ic = h('span', 'stat-ic'); ic.innerHTML = ICON[icon] || ICON.chart;
    t.append(ic, h('small', '', label), h('strong', '', value == null ? '—' : String(value)));
    return t;
}

function cleanHex(c) { return /^#[0-9a-f]{6}$/i.test(String(c || '')) ? c : ''; }

/* Fill the last 30 days, carrying the newest known value forward, so the line is continuous. */
function series30(st, key) {
    const byDay = new Map((st.series || []).map(r => [r.d, Number(r[key]) || 0]));
    const out = [];
    let last = 0;
    for (let d = st.day - 29; d <= st.day; d++) {
        if (byDay.has(d)) last = byDay.get(d);
        out.push({ d, v: last });
    }
    return out;
}

function deltaLabel(st, key) {
    const pts = series30(st, key);
    const start = pts[0].v, end = pts[pts.length - 1].v, diff = end - start;
    return diff > 0 ? `+${diff}` : diff < 0 ? String(diff) : 'steady';
}

function chartCard(title, st, key, colour, empty) {
    const card = h('section', 'stat-card');
    const pts = series30(st, key);
    const has = (st.series || []).length > 0 && pts.some(p => p.v > 0);
    card.append(h('h3', '', title));
    if (!has) { card.append(h('p', 'hint', empty)); return card; }
    const wrap = h('div', 'spark-wrap'); wrap.innerHTML = sparkSVG(pts, colour, `${st.id}-${key}`);
    const min = Math.min(...pts.map(p => p.v)), max = Math.max(...pts.map(p => p.v));
    const scale = h('div', 'spark-scale');
    scale.append(h('span', '', `${min}`), h('span', '', `${max}`));
    card.append(wrap, scale);
    return card;
}

function sparkSVG(points, colour, id) {
    const w = 600, gh = 150, pad = 10;
    const vs = points.map(p => p.v), min = Math.min(...vs), max = Math.max(...vs), span = Math.max(1, max - min);
    const px = (i) => pad + i * (w - 2 * pad) / Math.max(1, points.length - 1);
    const py = (v) => gh - pad - (v - min) / span * (gh - 2 * pad);
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)} ${py(p.v).toFixed(1)}`).join('');
    const area = `${line}L${px(points.length - 1).toFixed(1)} ${gh - pad}L${px(0).toFixed(1)} ${gh - pad}Z`;
    const dot = points.length - 1;
    return `<svg class="spark" viewBox="0 0 ${w} ${gh}" preserveAspectRatio="none" role="img" aria-label="growth chart">
      <defs><linearGradient id="sg-${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${colour}" stop-opacity=".38"/><stop offset="1" stop-color="${colour}" stop-opacity="0"/></linearGradient></defs>
      <path d="${area}" fill="url(#sg-${id})"/>
      <path d="${line}" fill="none" stroke="${colour}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${px(dot).toFixed(1)}" cy="${py(points[dot].v).toFixed(1)}" r="4" fill="${colour}"/>
    </svg>`;
}

function peopleCard(title, rows, empty) {
    const card = h('section', 'stat-card');
    card.append(h('h3', '', title));
    if (!rows.length) { card.append(h('p', 'hint', empty || 'Nobody yet.')); return card; }
    const list = h('div', 'stat-people');
    rows.forEach((r, i) => {
        const row = h('div', 'stat-person');
        row.append(h('em', 'stat-rank', String(i + 1)), h('span', '', r.name || 'Member'), h('strong', '', r.value));
        list.append(row);
    });
    card.append(list);
    return card;
}
