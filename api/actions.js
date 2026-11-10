// Server-side action groups split out of auth.js so neither file grows unwieldy.
const { ACCENTS, cleanColour, MONTH, nowSeconds, isAdmin, isMember, createWithId, plusOn, boostTier, BOOST_PERKS, SERVER_FONTS, statusOf, srv, lg, reapVoice, endVoice, vLive, voiceRoom, User, Msg, Server, Channel, SStat, Voice, VStat, Signal, Log, Read, Meta, Friend, Boost } = require('../lib/core');

const OVERCLOCK_ACTIONS = new Set(['flare-grant', 'boost-info', 'server-boost', 'server-perk', 'boost-history']);
const STATS_ACTIONS = new Set(['server-stats']);

// Live stats channels: counts come from the server row, growth from one snapshot per day.
const snapDone = new Map(); // sid -> "day:members:boosts" so we only write when the day or the numbers change
async function statsActions({ body, auth, res }) {
  const { action, id } = body;
  if (action === 'server-stats') {
    const server = await Server.findOne({ _id: Number(id), m: auth.userId }).lean();
    if (!server) return res.status(403).json({ error: 'Not a member.' });
    const sid = server._id, now = nowSeconds(), day = Math.floor(now / 86400), memberIds = server.m || [];
    const stamp = `${day}:${memberIds.length}:${server.bc || 0}`;
    if (snapDone.get(sid) !== stamp) {
      await SStat.updateOne({ _id: `${sid}:${day}` }, { $set: { s: sid, d: day, m: memberIds.length, o: server.bc || 0 } }, { upsert: true });
      snapDone.set(sid, stamp);
    }
    const [snaps, users, inVoice, week, boostRows, voiceTop] = await Promise.all([
      SStat.find({ s: sid, d: { $gte: day - 29 } }).sort({ d: 1 }).lean(),
      User.find({ _id: { $in: memberIds } }).select('n ls i').lean(),
      Voice.find({ s: sid, ts: { $gt: vLive() } }).select('ch').lean(),
      Log.aggregate([{ $match: { s: sid, ty: 'voice_leave', t: { $gt: now - 604800 } } }, { $group: { _id: null, t: { $sum: '$d' } } }]),
      Boost.find({ s: sid, t: { $gte: now - MONTH } }).select('u n').lean(),
      VStat.find({ s: sid }).sort({ t: -1 }).limit(5).lean()
    ]);
    const nm = Object.fromEntries(users.map(u => [u._id, u.n]));
    const missing = [...new Set([...boostRows.map(b => b.u), ...voiceTop.map(v => v.u)].filter(u => u != null && !nm[u]))];
    if (missing.length) (await User.find({ _id: { $in: missing } }).select('n').lean()).forEach(u => { nm[u._id] = u.n; });
    const byUser = {};
    for (const b of boostRows) byUser[b.u] = (byUser[b.u] || 0) + (b.n || 1);
    const topBoosters = Object.entries(byUser).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([u, n]) => ({ username: nm[u] || 'Member', n }));
    const boosts = server.bc || 0, next = BOOST_PERKS.find(p => boosts < p.at);
    return res.status(200).json({
      id: sid, name: server.n,
      members: memberIds.length, online: users.filter(u => statusOf(u) !== 'offline').length, voice: inVoice.length,
      boosts, tier: boostTier(boosts), nextPerk: next ? { n: next.n, at: next.at } : null,
      series: snaps.map(r => ({ d: r.d, m: r.m || 0, o: r.o || 0 })),
      weekVoice: week[0] ? week[0].t : 0,
      topVoice: voiceTop.map(v => ({ username: nm[v.u] || 'Member', t: v.t || 0 })),
      topBoosters, day
    });
  }
  return res.status(400).json({ error: 'Invalid action.' });
}

async function overclockActions({ body, auth, res }) {
    const { action, id, username, count, perk, on, colour, font } = body;
    if (action === 'flare-grant') {
      // Admins can hand out (or take back) any number of overclocks. They are the same currency Plus grants every month.
      const adm = await User.findById(auth.userId).select('e').lean();
      if (!adm || !isAdmin(adm.e)) return res.status(403).json({ error: 'Admins only.' });
      const qn = String(username || '').trim();
      if (!qn) return res.status(400).json({ error: 'Username or email required.' });
      const target = await User.findOne({ $or: [{ n: qn }, { e: qn.toLowerCase() }] }).select('n ub').lean();
      if (!target) return res.status(404).json({ error: 'User not found.' });
      const n = Math.round(Number(count) || 0);
      if (!n) return res.status(400).json({ error: 'Enter how many overclocks to give or take.' });
      const next = Math.max(0, Math.min(1000000, (target.ub || 0) + Math.max(-1000000, Math.min(1000000, n))));
      await User.updateOne({ _id: target._id }, { $set: { ub: next } });
      await lg(0, 'boost_grant', auth.userId, { u: target._id, x: `${n > 0 ? '+' : ''}${next - (target.ub || 0)} overclocks (admin)` });
      return res.status(200).json({ username: target.n, boosts: next, delta: next - (target.ub || 0) });
    }

    if (action === 'boost-info') {
      const sid = Number(id);
      if (!(await isMember(sid, auth.userId))) return res.status(403).json({ error: 'Not a member.' });
      const [server, me, rows, grants] = await Promise.all([
        Server.findById(sid).select('o n bc bp sc sf bn lg em sk').lean(),
        User.findById(auth.userId).select('ub pl pe ng').lean(),
        Boost.aggregate([{ $match: { s: sid } }, { $group: { _id: '$u', n: { $sum: { $ifNull: ['$n', 1] } }, t: { $max: '$t' } } }, { $sort: { t: -1 } }, { $limit: 30 }]),
        Log.find({ a: auth.userId, ty: 'boost_grant' }).sort({ _id: -1 }).limit(20).lean()
      ]);
      if (!server) return res.status(404).json({ error: 'Server not found.' });
      const boosters = await User.find({ _id: { $in: rows.map(r => r._id) } }).select('n').lean();
      const nm = Object.fromEntries(boosters.map(u => [u._id, u.n]));
      const plus = plusOn(me);
      return res.status(200).json({
        server: server.n, owner: server.o, boosts: server.bc || 0, tier: boostTier(server.bc), perks: server.bp || [], accent: server.sc || '', font: server.sf || '',
        banner: server.bn || '', logo: server.lg || '', emoji: server.em || [], stickers: server.sk || [],
        available: BOOST_PERKS, mine: me.ub || 0, plus, nextBoosts: plus ? (me.ng || 0) : 0,
        history: rows.map(r => ({ t: r.t, by: nm[r._id] || 'someone', n: r.n })),
        grants: grants.map(l => ({ t: l.t, x: l.x }))
      });
    }

    if (action === 'server-boost') {
      const sid = Number(id);
      if (!(await isMember(sid, auth.userId))) return res.status(403).json({ error: 'Not a member.' });
      const server = await Server.findById(sid).select('n').lean();
      if (!server) return res.status(404).json({ error: 'Server not found.' });
      const adm = await User.findById(auth.userId).select('e').lean();
      const max = adm && isAdmin(adm.e) ? 10000 : 10;
      const amount = Math.max(1, Math.min(max, Math.round(Number(count) || 1)));
      const spent = await User.findOneAndUpdate({ _id: auth.userId, ub: { $gte: amount } }, { $inc: { ub: -amount } }, { new: true }).select('ub').lean();
      if (!spent) return res.status(400).json({ error: 'You do not have enough overclocks.' });
      try {
        await createWithId(Boost, { u: auth.userId, s: sid, n: amount }); // one row per batch, not per click
        const agg = await Boost.aggregate([{ $match: { s: sid } }, { $group: { _id: null, t: { $sum: { $ifNull: ['$n', 1] } } } }]);
        const total = agg.length ? agg[0].t : 0;
        await Server.updateOne({ _id: sid }, { $set: { bc: total } });
        const burst = await Log.findOne({ s: sid, ty: 'server_boost', a: auth.userId, t: { $gte: nowSeconds() - 600 } }).sort({ _id: -1 }).lean();
        const sum = (burst ? burst.d || 0 : 0) + amount;
        if (burst) await Log.updateOne({ _id: burst._id }, { $set: { t: nowSeconds(), d: sum, x: `+${sum} overclock${sum === 1 ? '' : 's'}` } });
        else await lg(sid, 'server_boost', auth.userId, { d: amount, x: `+${amount} overclock${amount === 1 ? '' : 's'}` });
        const fresh = await Server.findById(sid).select('bc bp sc sf bn lg em sk').lean();
        return res.status(200).json({ ok: true, boosts: total, tier: boostTier(total), left: spent.ub, unlocked: BOOST_PERKS.filter(p => total >= p.at).map(p => p.k), perks: fresh.bp || [], accent: fresh.sc || '', font: fresh.sf || '', banner: fresh.bn || '', logo: fresh.lg || '', emoji: fresh.em || [], stickers: fresh.sk || [] });
      } catch (e) {
        await User.updateOne({ _id: auth.userId }, { $inc: { ub: amount } }); // never charge for an overclock that was not stored
        throw e;
      }
    }

    if (action === 'server-perk') {
      const server = await Server.findOne({ _id: Number(id), o: auth.userId }).select('n bc bp sc').lean();
      if (!server) return res.status(403).json({ error: 'Only the owner can change server perks.' });
      const def = BOOST_PERKS.find(p => p.k === String(perk || ''));
      if (!def) return res.status(400).json({ error: 'Unknown perk.' });
      if ((server.bc || 0) < def.at) return res.status(400).json({ error: `This perk unlocks at ${def.at} overclocks.` });
      const yes = on !== false;
      const update = yes ? { $addToSet: { bp: def.k } } : { $pull: { bp: def.k } };
      if (def.k === 'accent') {
        const col = cleanColour(colour) || (ACCENTS.includes(colour) ? colour : '');
        if (yes && !col) return res.status(400).json({ error: 'Pick an accent colour.' });
        update.$set = { sc: yes ? col : '', sf: yes && SERVER_FONTS.includes(String(font || '')) ? String(font || '') : '' };
      }
      if (!yes && (def.k === 'banner' || def.k === 'logo')) update.$set = def.k === 'banner' ? { bn: '' } : { lg: '' }; // locked art must not keep showing
      await Server.updateOne({ _id: server._id }, update);
      await lg(server._id, 'server_perk', auth.userId, { x: `${def.k} ${yes ? 'enabled' : 'disabled'}${def.k === 'accent' && yes ? ` (${update.$set.sc})` : ''}` });
      const fresh = await Server.findById(server._id).lean();
      return res.status(200).json({ server: srv(fresh) });
    }

    if (action === 'boost-history') {
      const logs = await Log.find({ ty: { $in: ['plus_grant', 'plus_expire', 'boost_grant', 'server_boost'] }, $or: [{ a: auth.userId }, { u: auth.userId }] }).sort({ _id: -1 }).limit(30).lean();
      const sids = [...new Set(logs.filter(l => l.s > 0).map(l => l.s))];
      const servers = sids.length ? await Server.find({ _id: { $in: sids } }).select('n').lean() : [];
      const nm = Object.fromEntries(servers.map(s => [s._id, s.n]));
      return res.status(200).json({ history: logs.map(l => ({ t: l.t, ty: l.ty, x: l.x, server: nm[l.s] || '' })) });
    }
    return res.status(400).json({ error: 'Invalid action.' });
}

async function migrateAction({ body, auth, res }) {
    const { action } = body;
    if (action === 'migrate') {
      const adm = await User.findById(auth.userId).select('e').lean();
      if (!adm || !isAdmin(adm.e)) return res.status(403).json({ error: 'Admins only.' });
      const [m1, m2, m3, m4, m5] = await Promise.all([Meta.findById('migrate1').lean(), Meta.findById('migrate2').lean(), Meta.findById('migrate3').lean(), Meta.findById('migrate4').lean(), Meta.findById('migrate5').lean()]);
      if (m1 && m1.v === 1 && m2 && m2.v === 1 && m3 && m3.v === 1 && m4 && m4.v === 1 && m5 && m5.v === 1) return res.status(200).json({ ok: true, already: true, at: m5.at });
      let vstats = 0, vtSet = 0, mcSet = 0, defaults = 0;
      if (!(m1 && m1.v === 1)) {
        try { await Meta.create({ _id: 'migrate1', v: 0, at: 0 }); } catch (e) { if (e.code !== 11000) throw e; }
        // a. Organized voice totals from the session history. $setOnInsert: rows already written by live sessions are left alone.
        const voiceAgg = await Log.aggregate([{ $match: { ty: 'voice_leave', s: { $gt: 0 } } }, { $group: { _id: { s: '$s', u: '$a' }, t: { $sum: '$d' }, n: { $sum: 1 }, last: { $max: '$t' } } }]);
        for (const r of voiceAgg) {
          const x = await VStat.updateOne({ _id: `${r._id.s}:${r._id.u}` }, { $setOnInsert: { s: r._id.s, u: r._id.u, t: r.t, n: r.n, last: r.last } }, { upsert: true });
          vstats += x.upsertedCount || 0;
        }
        // b. Per-user counters, only where missing or still zero so live counts are never overwritten.
        const vtAgg = await VStat.aggregate([{ $group: { _id: '$u', t: { $sum: '$t' } } }]);
        for (const r of vtAgg) vtSet += (await User.updateOne({ _id: r._id, $or: [{ vt: { $exists: false } }, { vt: 0 }] }, { $set: { vt: r.t } })).modifiedCount;
        const mcAgg = await Msg.aggregate([{ $group: { _id: '$a', n: { $sum: 1 } } }]);
        for (const r of mcAgg) mcSet += (await User.updateOne({ _id: r._id, $or: [{ mc: { $exists: false } }, { mc: 0 }] }, { $set: { mc: r.n } })).modifiedCount;
        // c. Defaults for old rows.
        const defs = await User.updateMany({ $or: [{ pl: { $exists: false } }, { vt: { $exists: false } }, { mc: { $exists: false } }] }, [{ $set: { pl: { $ifNull: ['$pl', false] }, vt: { $ifNull: ['$vt', 0] }, mc: { $ifNull: ['$mc', 0] } } }], { updatePipeline: true });
        defaults = defs.modifiedCount;
        // d. Indexes for the fast paths.
        await Promise.all([User.createIndexes(), Msg.createIndexes(), Server.createIndexes(), Channel.createIndexes(), Voice.createIndexes(), VStat.createIndexes(), Signal.createIndexes(), Log.createIndexes(), Read.createIndexes()]);
        await Meta.updateOne({ _id: 'migrate1' }, { v: 1, at: nowSeconds() });
      }
      // v3: friends written by the old auto-accept code have no requester/time fields. They stay accepted, marked as "before tracking".
      const fr = await Friend.updateMany({ $or: [{ by: { $exists: false } }, { t: { $exists: false } }, { r: { $exists: false } }] }, [{ $set: { by: { $ifNull: ['$by', 0] }, t: { $ifNull: ['$t', 0] }, r: { $ifNull: ['$r', 0] }, s: { $ifNull: ['$s', 'a'] } } }], { updatePipeline: true });
      await Friend.createIndexes();
      if (!(m2 && m2.v === 1)) {
        try { await Meta.create({ _id: 'migrate2', v: 0, at: 0 }); } catch (e) { if (e.code !== 11000) throw e; }
        await Meta.updateOne({ _id: 'migrate2' }, { v: 1, at: nowSeconds() });
      }
      // v4: time-limited Plus and permanent boosts. Only missing values are filled; existing dates and credits are never touched.
      let planDefaults = 0, legacyPlans = 0, serverDefaults = 0;
      if (!(m3 && m3.v === 1)) {
        try { await Meta.create({ _id: 'migrate3', v: 0, at: 0 }); } catch (e) { if (e.code !== 11000) throw e; }
        const now = nowSeconds();
        const du = await User.updateMany(
          { $or: [{ pe: { $exists: false } }, { ng: { $exists: false } }, { ub: { $exists: false } }] },
          [{ $set: { pe: { $ifNull: ['$pe', 0] }, ng: { $ifNull: ['$ng', 0] }, ub: { $ifNull: ['$ub', 0] } } }],
          { updatePipeline: true }
        );
        planDefaults = du.modifiedCount;
        // Legacy rows were "Plus forever"; they now get the standard month, starting today, plus that month's 2 boosts, once.
        const legacy = await User.updateMany(
          { pl: true, $or: [{ pe: { $exists: false } }, { pe: 0 }] },
          [{ $set: { pe: now + MONTH, ng: now + MONTH, ub: { $add: [{ $ifNull: ['$ub', 0] }, 2] } } }],
          { updatePipeline: true }
        );
        legacyPlans = legacy.modifiedCount;
        const ds = await Server.updateMany(
          { $or: [{ bc: { $exists: false } }, { bp: { $exists: false } }, { sc: { $exists: false } }] },
          [{ $set: { bc: { $ifNull: ['$bc', 0] }, bp: { $ifNull: ['$bp', []] }, sc: { $ifNull: ['$sc', ''] } } }],
          { updatePipeline: true }
        );
        serverDefaults = ds.modifiedCount;
        await Promise.all([User.createIndexes(), Server.createIndexes(), Boost.createIndexes()]);
        await Meta.updateOne({ _id: 'migrate3' }, { v: 1, at: now });
      }
      // v5: statuses for everyone, profile glow, and server banner/logo/custom emoji/sticker fields.
      let statusDefaults = 0, serverAssets = 0;
      if (!(m4 && m4.v === 1)) {
        try { await Meta.create({ _id: 'migrate4', v: 0, at: 0 }); } catch (e) { if (e.code !== 11000) throw e; }
        statusDefaults = (await User.updateMany(
          { $or: [{ sx: { $exists: false } }, { pg: { $exists: false } }] },
          [{ $set: { sx: { $ifNull: ['$sx', 0] }, pg: { $ifNull: ['$pg', ''] } } }],
          { updatePipeline: true }
        )).modifiedCount;
        serverAssets = (await Server.updateMany(
          { $or: [{ bn: { $exists: false } }, { lg: { $exists: false } }, { em: { $exists: false } }, { sk: { $exists: false } }] },
          [{ $set: { bn: { $ifNull: ['$bn', ''] }, lg: { $ifNull: ['$lg', ''] }, em: { $ifNull: ['$em', []] }, sk: { $ifNull: ['$sk', []] } } }],
          { updatePipeline: true }
        )).modifiedCount;
        await Meta.updateOne({ _id: 'migrate4' }, { v: 1, at: nowSeconds() });
      }
      // v6: stats-channel snapshots (one row per server for today) and the Plus profile name font default.
      let statsSeeded = 0, nameFontDefaults = 0;
      if (!(m5 && m5.v === 1)) {
        try { await Meta.create({ _id: 'migrate5', v: 0, at: 0 }); } catch (e) { if (e.code !== 11000) throw e; }
        nameFontDefaults = (await User.updateMany({ nf: { $exists: false } }, { $set: { nf: '' } })).modifiedCount;
        const day = Math.floor(nowSeconds() / 86400);
        const servers = await Server.find({}).select('m bc').lean();
        const ops = servers.map(s => ({
          updateOne: {
            filter: { _id: `${s._id}:${day}` },
            update: { $setOnInsert: { s: s._id, d: day, m: (s.m || []).length, o: s.bc || 0 } },
            upsert: true
          }
        }));
        if (ops.length) statsSeeded = (await SStat.bulkWrite(ops, { ordered: false })).upsertedCount || 0;
        await Promise.all([SStat.createIndexes(), Channel.createIndexes(), User.createIndexes()]);
        await Meta.updateOne({ _id: 'migrate5' }, { v: 1, at: nowSeconds() });
      }
      await lg(0, 'migrate', auth.userId, { x: `vstats ${vstats}, vt ${vtSet}, mc ${mcSet}, friends ${fr.modifiedCount}, plans ${legacyPlans}, servers ${serverDefaults}, statuses ${statusDefaults}, assets ${serverAssets}, stats ${statsSeeded}` });
      return res.status(200).json({ ok: true, vstats, vtBackfilled: vtSet, mcBackfilled: mcSet, defaults, friendsBackfilled: fr.modifiedCount, planDefaults, legacyPlans, serverDefaults, statusDefaults, serverAssets, statsSeeded, nameFontDefaults });
    }
}

async function voiceActions({ body, auth, res }) {
    const { action, id, channelId, mu, df, to, sig } = body;
    if (action === 'voice-ice') {
      const ice = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
      if (process.env.TURN_URL) ice.push({ urls: String(process.env.TURN_URL).split(','), username: process.env.TURN_USER || '', credential: process.env.TURN_PASS || '' });
      return res.status(200).json({ iceServers: ice });
    }

    if (action === 'voice-join') {
      if (!(await isMember(id, auth.userId))) return res.status(403).json({ error: 'Not a member.' });
      const ch = await Channel.findOne({ _id: Number(channelId), s: Number(id), k: 'v', d: { $ne: 1 } }).lean();
      if (!ch) return res.status(404).json({ error: 'Voice channel not found.' });
      await reapVoice(ch.s);
      const prev = await Voice.findOneAndDelete({ _id: auth.userId }); if (prev) await endVoice(prev, prev.ts > vLive() ? undefined : prev.ts); // switching channels closes the old session
      await Signal.deleteMany({ $or: [{ to: auth.userId }, { from: auth.userId }] });
      await lg(ch.s, 'voice_join', auth.userId, { ch: ch._id, cn: ch.n });
      await Voice.updateOne({ _id: auth.userId }, { s: ch.s, ch: ch._id, ts: nowSeconds(), j: Date.now(), mu: !!mu, df: !!df }, { upsert: true });
      await User.updateOne({ _id: auth.userId }, { ls: nowSeconds() });
      return res.status(200).json({ peers: await voiceRoom(ch.s, ch._id) });
    }

    if (action === 'voice-sync') {
      const v = await Voice.findById(auth.userId).lean();
      if (!v) return res.status(404).json({ error: 'Not in voice.' });
      if (!!v.mu !== !!mu || !!v.df !== !!df) await lg(v.s, 'voice_state', auth.userId, { ch: v.ch, x: df ? 'deafened' : mu ? 'muted' : 'unmuted' });
      await Voice.updateOne({ _id: auth.userId }, { ts: nowSeconds(), mu: !!mu, df: !!df });
      await User.updateOne({ _id: auth.userId }, { ls: nowSeconds() });
      const sigs = await Signal.find({ to: auth.userId, x: { $gt: nowSeconds() } }).sort({ _id: 1 }).limit(200).lean();
      await Signal.deleteMany({ to: auth.userId, $or: [{ _id: { $in: sigs.map(x => x._id) } }, { x: { $lte: nowSeconds() } }] });
      return res.status(200).json({ peers: await voiceRoom(v.s, v.ch), signals: sigs.map(x => ({ from: x.from, sig: x.d })) });
    }

    if (action === 'voice-signal') {
      const [a, b] = await Promise.all([Voice.findById(auth.userId).lean(), Voice.findById(Number(to)).lean()]);
      if (!a || !b || a.ch !== b.ch || a.s !== b.s || b.ts <= vLive()) return res.status(404).json({ error: 'Peer is not in your channel.' });
      const d = String(sig || '');
      if (!d || d.length > 20000) return res.status(400).json({ error: 'Bad signal.' });
      await Signal.create({ to: b._id, from: auth.userId, d, x: nowSeconds() + 60 });
      return res.status(200).json({ ok: true });
    }

    if (action === 'voice-leave') {
      const gone = await Voice.findOneAndDelete({ _id: auth.userId }); if (gone) await endVoice(gone);
      await Signal.deleteMany({ $or: [{ to: auth.userId }, { from: auth.userId }] });
      return res.status(200).json({ ok: true });
    }

    if (action === 'voice-list') {
      if (!(await isMember(id, auth.userId))) return res.status(403).json({ error: 'Not a member.' });
      await reapVoice(Number(id));
      const vs = await Voice.find({ s: Number(id), ts: { $gt: vLive() } }).lean();
      const us = await User.find({ _id: { $in: vs.map(v => v._id) } }).select('n av').lean();
      const m = Object.fromEntries(us.map(u => [u._id, u]));
      const out = {};
      vs.filter(v => m[v._id]).forEach(v => (out[v.ch] = out[v.ch] || []).push({ id: v._id, username: m[v._id].n, avatar: m[v._id].av || '', mu: !!v.mu, df: !!v.df, j: v.j || 0 }));
      return res.status(200).json({ voice: out });
    }
    return res.status(400).json({ error: 'Invalid action.' });
}

module.exports = { overclockActions, migrateAction, voiceActions, statsActions, OVERCLOCK_ACTIONS, STATS_ACTIONS };
