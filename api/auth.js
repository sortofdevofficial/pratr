// The handler lives here; models, helpers and connection setup live in ../lib/core.js.
const { mongoose, bcrypt, jwt, crypto, nowSeconds, onlineCut, statusOf, stOf, clientIp, geoOf, deviceOf, clientInfo, infoText, hit, DUMMY_HASH, CURRENT_SCHEMA_VERSION, ensureSchemaVersion, withV, connectDB, User, Pending, Session, Msg, Server, Channel, Voice, VStat, Signal, Log, Read, Meta, Friend, Invite, Boost, lg, VOICE_LIVE, vLive, endVoice, reapMyVoice, reapVoice, readKey, voiceRoom, shortCode, findInvite, sendOtp, nextId, createWithId, isAdmin, areFriends, isMember, srv, okImg, MONTH, plusOn, BOOST_PERKS, boostTier, SERVER_FONTS } = require('../lib/core');
const ACCENTS = ['#ffd36b', '#ff8fa3', '#7ee2b8', '#7cc4ff', '#b99bff', '#ffab6b', '#5ee0d6', '#f0e9db', '#ff5a4e', '#f472d0', '#8ef58a', '#6ea8ff', '#ffe45e', '#c6a4ff', '#ff9f43', '#9be7ff'];
// Colours are free-form hex, so people can glow in any shade they like. Values are stored in one canonical lowercase form.
const isColour = (c) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
const cleanColour = (c) => isColour(c) ? c.toLowerCase() : '';

// Plus plans end on their own. Expiring and the monthly 2-boost grant are lazy: they run on the next
// authenticated request, so no cron is needed. The cache keeps that to one extra read per user per minute.
const plusChecked = new Map();
async function refreshPlus(uid) {
  const now = nowSeconds();
  const u = await User.findById(uid).select('pl pe ng ub').lean();
  if (!u) return;
  if (u.pl && u.pe && u.pe <= now) {
    const r = await User.updateOne({ _id: uid, pl: true, pe: { $lte: now } }, { $set: { pl: false, ng: 0 } });
    if (r.modifiedCount) await lg(0, 'plus_expire', uid, { x: `plan ended ${new Date(u.pe * 1000).toISOString().slice(0, 10)}` });
    return;
  }
  if (plusOn(u, now) && u.ng && u.ng <= now) {
    const months = Math.min(24, Math.floor((now - u.ng) / MONTH) + 1);
    // Optimistic guard: only the request that still sees this ng value grants, so two tabs cannot double-credit.
    const r = await User.updateOne({ _id: uid, pl: true, ng: u.ng }, { $inc: { ub: 2 * months }, $set: { ng: u.ng + months * MONTH } });
    if (r.modifiedCount) await lg(0, 'boost_grant', uid, { x: `+${2 * months} overclocks (${months} month${months === 1 ? '' : 's'})` });
  }
}
async function refreshPlusMaybe(uid) {
  const last = plusChecked.get(uid) || 0;
  if (Date.now() - last < 60000) return;
  plusChecked.set(uid, Date.now());
  try { await refreshPlus(uid); } catch (e) { console.error('[plus]', e); }
}

module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    let body = req.body || {};
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch {} }

    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) return res.status(500).json({ error: 'Server is not configured.' });
    await connectDB();
    const tooMany = () => res.status(429).json({ error: 'Too many attempts. Please wait a bit and try again.' });
    const { action, email, password, otp, id, username, text, kind, name, channelId, category, channelName, code, avatar, icon, bio, desc, pub, ttl, q, status, ck, to, sig, mu, df, on, npw, lastId, afterId, st, ac, days, count, perk, colour, font, sx, pg, field, replyId } = body;

    if (action === 'register') {
      const key = String(email || '').trim().toLowerCase();
      if (!key || !password) return res.status(400).json({ error: 'Email and password required.' });
      if (String(password).length < 8 || String(password).length > 200) return res.status(400).json({ error: 'Password must be 8 to 200 characters.' });
      if (!(await hit(`reg:${clientIp(req)}`, 8, 3600)) || !(await hit(`rege:${key}`, 5, 3600))) return tooMany();
      if (await User.exists({ e: key })) return res.status(400).json({ error: 'Email already registered.' });
      const uname = String(username || '').trim().slice(0, 20);
      if (uname && await User.exists({ n: uname })) return res.status(400).json({ error: 'Username taken.' });
      const codeStr = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      await Pending.updateOne({ _id: key }, { p: await bcrypt.hash(password, 12), o: await bcrypt.hash(codeStr, 8), un: uname, x: nowSeconds() + 600 }, { upsert: true });
      await sendOtp(key, codeStr);
      return res.status(200).json({ message: 'Code sent.', email: key });
    }

    if (action === 'verify') {
      const key = String(email || '').trim().toLowerCase();
      if (!(await hit(`otp:${key}`, 6, 900)) || !(await hit(`otpi:${clientIp(req)}`, 30, 900))) return tooMany();
      const pending = await Pending.findById(key).lean();
      if (!pending || pending.x < nowSeconds() || !(await bcrypt.compare(String(otp || ''), pending.o))) return res.status(400).json({ error: 'Invalid code.' });
      const user = await createWithId(User, { e: key, p: pending.p, n: pending.un || undefined });
      if (!user.n) await User.updateOne({ _id: user._id }, { n: `user${user._id}` });
      await Pending.deleteOne({ _id: key });
      await lg(0, 'signup', user._id, { x: infoText(req) });
      await ensureSchemaVersion();
      const sid = crypto.randomBytes(12).toString('hex');
      await Session.create({ _id: `${user._id}:${sid}`, u: user._id, s: nowSeconds(), ...clientInfo(req) });
      const token = jwt.sign({ userId: user._id, sid }, process.env.JWT_SECRET, { expiresIn: '7d' });
      return res.status(200).json({ token, email: user.e, id: user._id });
    }

    if (action === 'login') {
      const key = String(email || '').trim().toLowerCase();
      if (!(await hit(`login:${clientIp(req)}`, 30, 600)) || !(await hit(`logine:${key}`, 10, 600))) return tooMany();
      const user = await User.findOne({ e: key });
      const okPw = await bcrypt.compare(String(password || ''), user ? user.p : DUMMY_HASH);
      if (!user || !okPw) {
        if (user) await lg(0, 'login_fail', user._id, { x: infoText(req) });
        return res.status(401).json({ error: 'Invalid credentials.' });
      }
      await lg(0, 'login', user._id, { x: infoText(req) });
      const sid = crypto.randomBytes(12).toString('hex');
      await Session.create({ _id: `${user._id}:${sid}`, u: user._id, s: nowSeconds(), ...clientInfo(req) });
      const token = jwt.sign({ userId: user._id, sid }, process.env.JWT_SECRET, { expiresIn: '7d' });
      return res.status(200).json({ token, email: user.e, id: user._id });
    }

    const authHeader = (req.headers && req.headers.authorization) || '';
    let auth = null;
    try { auth = authHeader.startsWith('Bearer ') ? jwt.verify(authHeader.slice(7), process.env.JWT_SECRET) : null; } catch { auth = null; }
    const sess = auth ? await Session.findById(`${auth.userId}:${auth.sid}`).select('ls s').lean() : null;
    if (!sess) return res.status(401).json({ error: 'Please log in again.' });
    if ((sess.ls || 0) < nowSeconds() - 60) await Session.updateOne({ _id: `${auth.userId}:${auth.sid}` }, { ls: nowSeconds(), li: clientIp(req), c: geoOf(req) });
    await refreshPlusMaybe(auth.userId);

    if (action === 'logout') {
      await Session.deleteOne({ _id: `${auth.userId}:${auth.sid}` });
      await lg(0, 'logout', auth.userId);
      return res.status(200).json({ ok: true });
    }

    if (action === 'me') {
      await reapMyVoice(auth.userId);
      await User.updateOne({ _id: auth.userId }, { ls: nowSeconds() });
      const me = await User.findById(auth.userId).select('e n av b ps pl pe ng ub st sx ac pg vt mc').lean();
      const now = nowSeconds();
      if (me.st && me.sx && me.sx <= now) { me.st = ''; me.sx = 0; await User.updateOne({ _id: auth.userId }, { $set: { st: '', sx: 0 } }); } // expired statuses clear themselves
      const plus = plusOn(me, now);
      return res.status(200).json({ id: me._id, email: me.e, username: me.n, avatar: me.av || '', bio: plus ? (me.b || '') : (me.b || '').slice(0, 160), status: me.ps || 'online', plus, plusUntil: me.pe || 0, boosts: me.ub || 0, nextBoosts: plus ? (me.ng || 0) : 0, statusText: me.st || '', statusUntil: me.sx || 0, accent: plus ? (me.ac || '') : '', glow: plus ? (me.pg || '') : '', admin: isAdmin(me.e), voice: me.vt || 0, msgs: me.mc || 0 });
    }

    if (action === 'presence-set') {
      const st = ['online', 'idle', 'dnd', 'invisible'].includes(status) ? status : 'online';
      await User.updateOne({ _id: auth.userId }, { ps: st, ls: nowSeconds() });
      await lg(0, 'status', auth.userId, { x: st });
      return res.status(200).json({ status: st });
    }

    if (action === 'profile-update') {
      const uname = String(username || '').trim().slice(0, 20);
      if (!uname) return res.status(400).json({ error: 'Username required.' });
      if (await User.exists({ n: uname, _id: { $ne: auth.userId } })) return res.status(400).json({ error: 'Username taken.' });
      if (!okImg(avatar ?? '')) return res.status(400).json({ error: 'Invalid image.' });
      const old = await User.findById(auth.userId).select('n av b pl pe st sx ac pg').lean();
      const plus = plusOn(old);
      const now = nowSeconds();
      const cleanBio = String(bio || '').trim().slice(0, plus ? 400 : 160);
      // Custom status is for everyone; the timer (sx, seconds from now) is optional and 0 means never.
      const cleanSt = String(st || '').trim().slice(0, 60);
      const ttl = Math.round(Number(sx) || 0);
      const cleanSx = cleanSt && ttl > 0 ? now + Math.max(60, Math.min(365 * 86400, ttl)) : 0;
      // Accent and profile glow stay Plus-only. Both accept any hex colour.
      const cleanAc = plus ? (cleanColour(ac) || (ACCENTS.includes(ac) ? ac : '') || old.ac || '') : (old.ac || '');
      const cleanPg = plus ? (cleanColour(pg) || (ACCENTS.includes(pg) ? pg : '') || old.pg || '') : (old.pg || '');
      await User.updateOne({ _id: auth.userId }, { n: uname, av: avatar || '', b: cleanBio, st: cleanSt, sx: cleanSx, ac: cleanAc, pg: cleanPg });
      const diff = [old.n !== uname && `name ${old.n} → ${uname}`, (old.av || '') !== (avatar || '') && 'avatar changed', (old.b || '') !== cleanBio && 'bio changed', (old.st || '') !== cleanSt && `status “${cleanSt || 'cleared'}”`, (old.sx || 0) !== cleanSx && (cleanSx ? `status expires ${new Date(cleanSx * 1000).toISOString().slice(0, 16)}` : 'status never expires'), (old.ac || '') !== cleanAc && 'accent changed', (old.pg || '') !== cleanPg && 'profile glow changed'].filter(Boolean);
      if (diff.length) await lg(0, 'profile', auth.userId, { x: diff.join(', ') });
      return res.status(200).json({ username: uname, avatar: avatar || '', bio: cleanBio, statusText: cleanSt, statusUntil: cleanSx, accent: cleanAc, glow: cleanPg });
    }

    if (action === 'upload-sign') {
      if (!(await hit(`up:${auth.userId}`, 20, 3600))) return tooMany();
      const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: key, CLOUDINARY_API_SECRET: secret } = process.env;
      if (!cloud || !key || !secret) return res.status(500).json({ error: 'Image uploads are not configured.' });
      const folder = kind === 'servers' ? 'pratr/servers' : 'pratr/avatars', timestamp = nowSeconds();
      const signature = crypto.createHash('sha1').update(`folder=${folder}&timestamp=${timestamp}${secret}`).digest('hex');
      return res.status(200).json({ cloud, key, timestamp, signature, folder });
    }

    if (action === 'server-update') {
      const cleanName = String(name || '').trim().slice(0, 60);
      if (!cleanName) return res.status(400).json({ error: 'Server name required.' });
      if (!okImg(icon ?? '')) return res.status(400).json({ error: 'Invalid image.' });
      const old = await Server.findOne({ _id: Number(id), o: auth.userId }).select('bp').lean();
      if (!old) return res.status(403).json({ error: 'Only the owner can edit the server.' });
      const descLimit = (old.bp || []).includes('desc') ? 300 : 120; // boost perk
      const server = await Server.findOneAndUpdate({ _id: Number(id), o: auth.userId }, { n: cleanName, ic: icon || '', ds: String(desc || '').trim().slice(0, descLimit), pub: !!pub }, { new: true }).lean();
      if (!server) return res.status(403).json({ error: 'Only the owner can edit the server.' });
      await lg(server._id, 'server_update', auth.userId, { x: `${cleanName}${pub ? ' (listed in Discover)' : ''}` });
      return res.status(200).json({ server: srv(server) });
    }

    if (action === 'server-asset') {
      // Banner and logo are image perks: the owner can only set them once the perk is unlocked and enabled.
      const server = await Server.findOne({ _id: Number(id), o: auth.userId }).select('bp n').lean();
      if (!server) return res.status(403).json({ error: 'Only the owner can edit the server.' });
      const which = field === 'banner' ? 'banner' : field === 'logo' ? 'logo' : '';
      if (!which) return res.status(400).json({ error: 'Unknown image.' });
      if (!(server.bp || []).includes(which)) return res.status(400).json({ error: `Enable the ${which === 'banner' ? 'animated banner' : 'server logo'} perk first.` });
      if (!okImg(icon ?? '')) return res.status(400).json({ error: 'Invalid image.' });
      const fresh = await Server.findOneAndUpdate({ _id: server._id, o: auth.userId }, which === 'banner' ? { bn: icon || '' } : { lg: icon || '' }, { new: true }).lean();
      await lg(server._id, 'server_update', auth.userId, { x: `${which} ${icon ? 'changed' : 'removed'}` });
      return res.status(200).json({ server: srv(fresh) });
    }

    if (action === 'emoji-add' || action === 'emoji-remove' || action === 'sticker-add' || action === 'sticker-remove') {
      if (!(await hit(`asset:${auth.userId}`, 60, 3600))) return tooMany();
      const isEmoji = action.startsWith('emoji');
      const adding = action.endsWith('-add');
      const server = await Server.findOne({ _id: Number(id), o: auth.userId }).select('em sk').lean();
      if (!server) return res.status(403).json({ error: 'Only the owner can edit the server.' });
      let nm = String(name || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
      if (!nm) return res.status(400).json({ error: 'Give it a short name (letters, numbers, underscores).' });
      const list = (isEmoji ? server.em : server.sk) || [];
      if (adding) {
        if (list.length >= (isEmoji ? 50 : 10)) return res.status(400).json({ error: `This server already has the maximum number of ${isEmoji ? 'emoji (50)' : 'stickers (10)'}.` });
        if (list.some(x => x.n === nm)) return res.status(400).json({ error: 'That name is already used here.' });
        if (!okImg(icon ?? '')) return res.status(400).json({ error: 'Upload an image first.' });
        await Server.updateOne({ _id: server._id }, isEmoji ? { $push: { em: { n: nm, u: icon } } } : { $push: { sk: { n: nm, u: icon } } });
        await lg(server._id, 'server_update', auth.userId, { x: `${isEmoji ? 'emoji' : 'sticker'} :${nm}: added` });
      } else {
        const found = list.some(x => x.n === nm);
        if (!found) return res.status(404).json({ error: 'Not found.' });
        await Server.updateOne({ _id: server._id }, isEmoji ? { $pull: { em: { n: nm } } } : { $pull: { sk: { n: nm } } });
        await lg(server._id, 'server_update', auth.userId, { x: `${isEmoji ? 'emoji' : 'sticker'} :${nm}: removed` });
      }
      const fresh = await Server.findById(server._id).select('em sk').lean();
      return res.status(200).json({ emoji: fresh.em || [], stickers: fresh.sk || [] });
    }

    if (action === 'friend-add') {
      if (!(await hit(`fr:${auth.userId}`, 20, 3600))) return tooMany();
      const q = String(username || '').trim();
      const other = await User.findOne({ $or: [{ n: q }, { e: q.toLowerCase() }] }).lean();
      if (!other) return res.status(404).json({ error: 'User not found.' });
      if (other._id === auth.userId) return res.status(400).json({ error: "You can't add yourself." });
      const [x, y] = [auth.userId, other._id].sort((p, q2) => p - q2);
      const key = `${x}:${y}`;
      const pair = (s) => ({ id: other._id, username: other.n, avatar: other.av || '', bio: plusOn(other) ? (other.b || '') : (other.b || '').slice(0, 160), status: statusOf(other), plus: plusOn(other), statusText: stOf(other), accent: plusOn(other) ? (other.ac || '') : '', glow: plusOn(other) ? (other.pg || '') : '', voice: other.vt || 0, msgs: other.mc || 0, s });
      const cur = await Friend.findById(key).lean();
      if (cur && cur.s === 'a') return res.status(400).json({ error: 'You are already friends.' });
      if (cur && cur.s === 'p') {
        if (cur.by === auth.userId) return res.status(400).json({ error: 'Request already sent — waiting for them to answer.' });
        await Friend.updateOne({ _id: key }, { $set: { s: 'a', r: nowSeconds() } }); // both asked: accept immediately
        await lg(0, 'friend_accept', auth.userId, { u: other._id });
        return res.status(200).json({ friend: pair('a'), accepted: true });
      }
      // New pair, or a previously denied one: (re)send the request.
      await Friend.updateOne({ _id: key }, { $set: { a: x, b: y, s: 'p', by: auth.userId, t: nowSeconds(), r: 0 } }, { upsert: true });
      await lg(0, 'friend_request', auth.userId, { u: other._id });
      return res.status(200).json({ requested: true, user: { id: other._id, username: other.n, avatar: other.av || '' } });
    }

    if (action === 'friend-accept' || action === 'friend-deny') {
      const uid = Number(id);
      if (!uid || uid === auth.userId) return res.status(400).json({ error: 'Pick another user.' });
      const [x, y] = [auth.userId, uid].sort((p, q2) => p - q2);
      const key = `${x}:${y}`;
      const doc = await Friend.findById(key).lean();
      if (!doc || doc.s !== 'p') return res.status(404).json({ error: 'No pending request.' });
      const other = await User.findById(uid).select('n av b ls ps pl pe st ac vt mc').lean();
      if (!other) return res.status(404).json({ error: 'User not found.' });
      if (action === 'friend-accept') {
        if (doc.by === auth.userId) return res.status(403).json({ error: 'That request is yours — waiting for them.' });
        await Friend.updateOne({ _id: key }, { $set: { s: 'a', r: nowSeconds() } });
        await lg(0, 'friend_accept', auth.userId, { u: uid });
        const plus = plusOn(other);
        return res.status(200).json({ friend: { id: other._id, username: other.n, avatar: other.av || '', bio: plus ? (other.b || '') : (other.b || '').slice(0, 160), status: statusOf(other), plus, statusText: stOf(other), accent: plus ? (other.ac || '') : '', glow: plus ? (other.pg || '') : '', voice: other.vt || 0, msgs: other.mc || 0 } });
      }
      // Denying an incoming request and cancelling your own outgoing one are the same stored event, logged differently.
      await Friend.updateOne({ _id: key }, { $set: { s: 'd', r: nowSeconds() } });
      await lg(0, doc.by === auth.userId ? 'friend_cancel' : 'friend_deny', auth.userId, { u: uid });
      return res.status(200).json({ ok: true });
    }

    if (action === 'server-join') {
      const found = await findInvite(String(code || ''));
      if (!found) return res.status(404).json({ error: 'Invalid invite.' });
      if (found.expired) return res.status(400).json({ error: 'This invite has expired.' });
      const { server, inv } = found;
      if (!server.m.includes(auth.userId)) {
        server.m.push(auth.userId); await server.save();
        if (inv) await Invite.updateOne({ _id: inv._id }, { $inc: { u: 1 } });
        await lg(server._id, 'member_join', auth.userId, { x: inv ? `invite ${inv._id}` : 'invite' });
      }
      return res.status(200).json({ server: srv(server) });
    }

    if (action === 'invite-create') {
      if (!(await hit(`iv:${auth.userId}`, 30, 3600))) return tooMany();
      const server = await Server.findOne({ _id: Number(id), m: auth.userId }).lean();
      if (!server) return res.status(403).json({ error: 'You are not a member of this server.' });
      const secs = Math.max(0, Math.min(Number(ttl) || 0, 31536000));
      const x = secs ? nowSeconds() + secs : 0;
      for (let tries = 0; tries < 5; tries++) {
        const newCode = shortCode();
        try { await Invite.create({ _id: newCode, s: server._id, by: auth.userId, x }); await lg(server._id, 'invite_create', auth.userId, { x: newCode + (x ? '' : ' (never expires)') }); return res.status(200).json({ code: newCode, expires: x }); }
        catch (e) { if (e.code !== 11000) throw e; } // code already taken, try another
      }
      return res.status(500).json({ error: 'Could not create invite.' });
    }

    if (action === 'invite-info') {
      const found = await findInvite(String(code || ''));
      if (!found) return res.status(404).json({ error: 'Invalid invite.' });
      const online = await User.countDocuments({ _id: { $in: found.server.m }, ls: { $gt: onlineCut() }, ps: { $ne: 'invisible' } });
      return res.status(200).json({ ...srv(found.server), online, expired: found.expired, joined: found.server.m.includes(auth.userId) });
    }

    if (action === 'discover') {
      const term = String(q || '').replace(/[^a-zA-Z0-9 ]/g, '').trim().slice(0, 40);
      const list = await Server.find({ pub: true, ...(term ? { n: new RegExp(term, 'i') } : {}) }).sort({ _id: -1 }).limit(60).lean();
      list.sort((a, b) => b.m.length - a.m.length);
      const ids = [...new Set(list.flatMap(s => s.m))];
      const on = new Set((await User.find({ _id: { $in: ids }, ls: { $gt: onlineCut() }, ps: { $ne: 'invisible' } }).select('_id').lean()).map(u => u._id));
      return res.status(200).json({ servers: list.map(s => ({ ...srv(s), online: s.m.filter(i => on.has(i)).length, joined: s.m.includes(auth.userId) })) });
    }

    if (action === 'server-join-public') {
      const server = await Server.findOne({ _id: Number(id), pub: true });
      if (!server) return res.status(404).json({ error: 'This server is not listed.' });
      if (!server.m.includes(auth.userId)) { server.m.push(auth.userId); await server.save(); await lg(server._id, 'member_join', auth.userId, { x: 'public join' }); }
      return res.status(200).json({ server: srv(server) });
    }

    // Soft delete: the message stays in the database, it is only hidden (d: 1).
    if (action === 'message-delete') {
      const msg = await Msg.findById(Number(id)).lean();
      if (!msg || msg.d === 1) return res.status(404).json({ error: 'Message not found.' });
      const isServerOwner = msg.s ? !!(await Server.exists({ _id: msg.s, o: auth.userId })) : false;
      if (msg.a !== auth.userId && !isServerOwner) return res.status(403).json({ error: "You can't delete this message." });
      await Msg.updateOne({ _id: msg._id }, { d: 1, dby: auth.userId, dt: nowSeconds() });
      if (msg.s) { const mc = await Channel.findById(msg.ch).select('n').lean(); await lg(msg.s, 'message_delete', auth.userId, { u: msg.a, ch: msg.ch, cn: mc ? mc.n : '', x: String(msg.m || '').slice(0, 200) }); }
      return res.status(200).json({ ok: true });
    }

    if (action === 'friends') {
      const docs = await Friend.find({ $or: [{ a: auth.userId }, { b: auth.userId }], s: { $in: ['a', 'p'] } }).lean();
      const others = docs.map(f => f.a === auth.userId ? f.b : f.a);
      const users = await User.find({ _id: { $in: others } }).select('n av b ls ps pl pe st sx ac pg vt mc').lean();
      const um = Object.fromEntries(users.map(u => [u._id, u]));
      const row = (u, f) => { const plus = plusOn(u); return { id: u._id, username: u.n, avatar: u.av || '', bio: plus ? (u.b || '') : (u.b || '').slice(0, 160), status: statusOf(u), plus, statusText: stOf(u), accent: plus ? (u.ac || '') : '', glow: plus ? (u.pg || '') : '', voice: u.vt || 0, msgs: u.mc || 0, t: f.t || 0 }; };
      const friends = [], incoming = [], outgoing = [];
      docs.forEach(f => {
        const u = um[f.a === auth.userId ? f.b : f.a];
        if (!u) return;
        if (f.s === 'a') friends.push(row(u, f));
        else if (f.by === auth.userId) outgoing.push(row(u, f));
        else incoming.push(row(u, f));
      });
      return res.status(200).json({ friends, incoming, outgoing });
    }

    if (action === 'servers') {
      await reapMyVoice(auth.userId);
      await User.updateOne({ _id: auth.userId }, { ls: nowSeconds() }); // polled every few seconds, doubles as presence
      const servers = await Server.find({ m: auth.userId }).lean();
      return res.status(200).json({ servers: servers.map(srv) });
    }

    if (action === 'server-create') {
      if (!(await hit(`sv:${auth.userId}`, 10, 3600))) return tooMany();
      const cleanName = String(name || '').trim().slice(0, 60);
      if (!cleanName) return res.status(400).json({ error: 'Server name required.' });
      const server = await createWithId(Server, { n: cleanName, o: auth.userId, m: [auth.userId], i: crypto.randomBytes(24).toString('hex') });
      await createWithId(Channel, { s: server._id, n: 'general', cat: 'TEXT CHANNELS' });
      await lg(server._id, 'server_create', auth.userId, { x: cleanName });
      return res.status(200).json({ server: srv(server) });
    }

    if (action === 'channels') {
      if (!(await isMember(id, auth.userId))) return res.status(403).json({ error: 'Not a member.' });
      const chans = await Channel.find({ s: Number(id), d: { $ne: 1 } }).sort({ _id: 1 }).lean();
      return res.status(200).json({ channels: chans.map(c => ({ id: c._id, name: c.n, category: c.cat, kind: c.k || 't' })) });
    }

    if (action === 'channel-create') {
      const serverId = Number(id);
      if (!(await Server.exists({ _id: serverId, o: auth.userId }))) return res.status(403).json({ error: 'Only owner can create channels.' });
      const chName = String(channelName || '').trim().toLowerCase().replace(/\s+/g, '-');
      if (!chName) return res.status(400).json({ error: 'Channel name required.' });
      const k = ck === 'v' ? 'v' : 't';
      const cat = String(category || '').trim().slice(0, 40) || (k === 'v' ? 'VOICE CHANNELS' : 'TEXT CHANNELS');
      const ch = await createWithId(Channel, { s: serverId, n: chName, cat, k });
      const chId = ch._id;
      await lg(serverId, 'channel_create', auth.userId, { ch: chId, cn: chName, x: k === 'v' ? 'voice' : 'text' });
      return res.status(200).json({ channel: { id: chId, name: chName, category: cat, kind: k } });
    }

    if (action === 'server-invite') {
      const server = await Server.findOne({ _id: Number(id), m: auth.userId }).lean();
      if (!server) return res.status(403).json({ error: 'You are not a member of this server.' });
      return res.status(200).json({ code: server.i });
    }

    if (action === 'invite-list') {
      if (!(await Server.exists({ _id: Number(id), o: auth.userId }))) return res.status(403).json({ error: 'Only the owner can view invites.' });
      const [list, server] = await Promise.all([
        Invite.find({ s: Number(id) }).sort({ _id: -1 }).limit(50).lean(),
        Server.findById(Number(id)).select('i').lean()
      ]);
      const bys = await User.find({ _id: { $in: [...new Set(list.map(i => i.by))] } }).select('n').lean();
      const nm = Object.fromEntries(bys.map(u => [u._id, u.n]));
      return res.status(200).json({
        permanent: server ? server.i || '' : '',
        invites: list.map(i => ({ code: i._id, by: nm[i.by] || 'someone', t: i.t, x: i.x || 0, uses: i.u || 0, expired: !!i.x && i.x < nowSeconds() }))
      });
    }

    if (action === 'members') {
      await User.updateOne({ _id: auth.userId }, { ls: nowSeconds() });
      const server = await Server.findOne({ _id: Number(id), m: auth.userId }).lean();
      if (!server) return res.status(403).json({ error: 'Not a member.' });
      const users = await User.find({ _id: { $in: server.m } }).select('n av b ls ps pl pe st sx ac pg vt mc').lean();
      return res.status(200).json({ owner: server.o, members: users.map(u => { const plus = plusOn(u); return { id: u._id, username: u.n, avatar: u.av, bio: plus ? (u.b || '') : (u.b || '').slice(0, 160), status: statusOf(u), plus, statusText: stOf(u), accent: plus ? (u.ac || '') : '', glow: plus ? (u.pg || '') : '', online: statusOf(u) !== 'offline', voice: u.vt || 0, msgs: u.mc || 0 }; }) });
    }

    if (action === 'channel-delete') {
      const ch = await Channel.findById(Number(channelId)).lean();
      if (!ch || !(await Server.exists({ _id: ch.s, o: auth.userId }))) return res.status(403).json({ error: 'Only the owner can delete channels.' });
      await Channel.updateOne({ _id: ch._id }, { d: 1 });
      await lg(ch.s, 'channel_delete', auth.userId, { ch: ch._id, cn: ch.n, x: ch.k === 'v' ? 'voice' : 'text' }); // hidden, messages and channel stay in the database
      return res.status(200).json({ ok: true });
    }

    if (action === 'server-leave') {
      const server = await Server.findOne({ _id: Number(id), m: auth.userId }).lean();
      if (!server) return res.status(404).json({ error: 'Not a member.' });
      if (server.o === auth.userId) return res.status(400).json({ error: 'Owners cannot leave their own server.' });
      await Server.updateOne({ _id: server._id }, { $pull: { m: auth.userId } });
      const lv = await Voice.findOneAndDelete({ _id: auth.userId, s: server._id }); if (lv) await endVoice(lv);
      await lg(server._id, 'member_leave', auth.userId);
      return res.status(200).json({ ok: true });
    }

    if (action === 'messages') {
      const isServer = kind === 'server';
      let match;
      if (isServer) {
        if (!(await isMember(id, auth.userId))) return res.status(403).json({ error: 'Not a member.' });
        if (!(await Channel.exists({ _id: Number(channelId), s: Number(id), k: { $ne: 'v' }, d: { $ne: 1 } }))) return res.status(404).json({ error: 'Channel not found.' });
        match = { s: Number(id), ch: Number(channelId) };
      } else {
        if (!(await areFriends(auth.userId, Number(id)))) return res.status(403).json({ error: 'You can only message friends.' });
        match = { $or: [{ a: auth.userId, b: Number(id) }, { a: Number(id), b: auth.userId }] };
      }
      const after = Number(afterId) || 0;
      const msgs = await Msg.find({ ...match, ...(after ? { _id: { $gt: after } } : {}), d: { $ne: 1 } }).sort({ _id: -1 }).limit(100).lean();
      const rpIds = [...new Set(msgs.map(m => m.rp).filter(Boolean))];
      const parents = rpIds.length ? await Msg.find({ _id: { $in: rpIds }, d: { $ne: 1 } }).select('_id a m').lean() : [];
      const parentMap = Object.fromEntries(parents.map(p => [p._id, p]));
      const authors = await User.find({ _id: { $in: [...new Set([...msgs.map(m => m.a), ...parents.map(p => p.a)])] } }).select('n av pl pe ac pg').lean();
      const people = Object.fromEntries(authors.map(u => [u._id, u]));
      return res.status(200).json({
        messages: msgs.reverse().map(m => {
          const p = people[m.a], plus = plusOn(p), par = parentMap[m.rp];
          return { id: m._id, mine: m.a === auth.userId, text: m.m, t: m.t, rx: Object.entries(m.rx || {}).map(([e, a]) => ({ e, n: a.length, me: a.includes(auth.userId) })).filter(r => r.n), reply: par ? { id: par._id, username: (people[par.a] || {}).n || 'Unknown', text: String(par.m || '').slice(0, 120) } : null, author: { id: m.a, username: p?.n || 'Unknown', avatar: p?.av, plus, accent: plus ? (p?.ac || '') : '', glow: plus ? (p?.pg || '') : '' } };
        })
      });
    }

    if (action === 'send') {
      const isServer = kind === 'server';
      const [okRate, me, member, chanOk, friendOk, srvPerks] = await Promise.all([
        hit(`msg:${auth.userId}`, 20, 10),
        User.findById(auth.userId).select('n av pl pe ac pg').lean(),
        isServer ? isMember(id, auth.userId) : true,
        isServer ? Channel.exists({ _id: Number(channelId), s: Number(id), k: { $ne: 'v' }, d: { $ne: 1 } }) : true,
        isServer ? true : areFriends(auth.userId, Number(id)),
        isServer ? Server.findById(Number(id)).select('bp').lean() : null
      ]);
      if (!okRate) return res.status(429).json({ error: 'You are sending messages too fast.' });
      const plus = plusOn(me);
      const limit = plus || (srvPerks && (srvPerks.bp || []).includes('longmsg')) ? 4000 : 2000;
      const clean = Array.from(String(text || '').trim()).slice(0, limit).join(''); // slice by character, never split an emoji
      if (!clean) return res.status(400).json({ error: 'Empty message.' });
      let target;
      if (isServer) {
        if (!member) return res.status(403).json({ error: 'Not a member.' });
        if (!chanOk) return res.status(400).json({ error: 'This server has no such text channel.' });
        target = { s: Number(id), ch: Number(channelId) };
      } else {
        if (!friendOk) return res.status(403).json({ error: 'You can only message friends.' });
        target = { b: Number(id) };
      }
      const [msg] = await Promise.all([createWithId(Msg, { a: auth.userId, ...target, m: clean }), User.updateOne({ _id: auth.userId }, { $inc: { mc: 1 } })]);
      let reply = null;
      const rp = Number(replyId) || 0;
      if (rp) {
        const parent = await Msg.findById(rp).select('_id a m s ch b d').lean();
        const same = parent && parent.d !== 1 && (isServer
          ? parent.s === Number(id) && parent.ch === Number(channelId)
          : (parent.a === auth.userId && parent.b === Number(id)) || (parent.a === Number(id) && parent.b === auth.userId));
        if (same) {
          const par = await User.findById(parent.a).select('n').lean();
          await Msg.updateOne({ _id: msg._id }, { $set: { rp: parent._id } });
          reply = { id: parent._id, username: par?.n || 'Unknown', text: String(parent.m || '').slice(0, 120) };
        }
      }
      return res.status(200).json({ message: { id: msg._id, mine: true, text: msg.m, t: msg.t, rx: [], reply, author: { id: auth.userId, username: me?.n || 'You', avatar: me?.av, plus, accent: plus ? (me?.ac || '') : '', glow: plus ? (me?.pg || '') : '' } } });
    }

    // ---------- read state (seen/unseen) ----------
    if (action === 'mark-read') {
      const key = readKey(auth.userId, kind, Number(id), Number(channelId));
      await Read.updateOne({ _id: key }, withV({ u: auth.userId, mid: Number(lastId) || 0 }), { upsert: true });
      return res.status(200).json({ ok: true });
    }

    if (action === 'unreads') {
      // Per server channel: unread (any new message) and pings (messages that actually mention you or @everyone/@here from the owner).
      // Batched: one query for all channels + one for all DMs, using the stored _id cursors (indexed), not timestamps.
      const [servers, reads, me] = await Promise.all([
        Server.find({ m: auth.userId }).select('_id o').lean(),
        Read.find({ u: auth.userId }).lean(),
        User.findById(auth.userId).select('n').lean()
      ]);
      const rmap = Object.fromEntries(reads.map(r => [r._id, r]));
      const ownerOf = Object.fromEntries(servers.map(s => [s._id, s.o]));
      const mine = ((me && me.n) || '').toLowerCase();
      const out = {};
      const chans = await Channel.find({ s: { $in: servers.map(s => s._id) }, k: 't', d: { $ne: 1 } }).select('_id s').lean();
      const cuts = chans.map(c => ({ c, since: (rmap[readKey(auth.userId, 'server', c.s, c._id)] || {}).mid || 0 }));
      if (cuts.length) {
        const fresh = await Msg.find({ $or: cuts.map(x => ({ s: x.c.s, ch: x.c._id, _id: { $gt: x.since } })), d: { $ne: 1 }, a: { $ne: auth.userId } }).select('m a s ch').limit(1000).lean();
        for (const m of fresh) {
          const o = out[m.ch] || (out[m.ch] = { unread: true, pings: 0 });
          const t = String(m.m || '').toLowerCase();
          if (t.includes('@' + mine) || (m.a === ownerOf[m.s] && (t.includes('@everyone') || t.includes('@here')))) o.pings++;
        }
      }
      const friends = await Friend.find({ $or: [{ a: auth.userId }, { b: auth.userId }], s: 'a' }).lean();
      const dmOut = {};
      const others = friends.map(f => f.a === auth.userId ? f.b : f.a);
      if (others.length) {
        const dmCuts = others.map(o => ({ o, since: (rmap[readKey(auth.userId, 'dm', o)] || {}).mid || 0 }));
        const dms = await Msg.find({ $or: dmCuts.map(x => ({ a: x.o, b: auth.userId, _id: { $gt: x.since } })), d: { $ne: 1 } }).select('a').limit(1000).lean();
        for (const m of dms) { const o = dmOut[m.a] || (dmOut[m.a] = { unread: true, pings: 0 }); o.pings++; } // a DM is inherently addressed to you
      }
      return res.status(200).json({ channels: out, dms: dmOut });
    }

    // ---------- security: sessions, password ----------
    if (action === 'security') {
      const cur = `${auth.userId}:${auth.sid}`;
      await Session.deleteMany({ u: auth.userId, s: { $lt: nowSeconds() - 7 * 86400 } });
      const ss = await Session.find({ u: auth.userId }).sort({ s: -1 }).limit(30).lean();
      const hist = await Log.find({ s: 0, a: auth.userId, ty: { $in: ['signup', 'login', 'login_fail', 'logout', 'session_revoke', 'password_change', 'friend_request', 'friend_accept', 'friend_deny', 'friend_cancel'] } }).sort({ _id: -1 }).limit(40).lean();
      return res.status(200).json({
        sessions: ss.map(x => ({ id: x._id, device: x.d || 'Unknown device', ip: x.i || '', lastIp: x.li || '', place: x.c || '', t: x.s, ls: x.ls || x.s, current: x._id === cur })),
        history: hist.map(l => ({ t: l.t, ty: l.ty, x: l.x, u: l.u, un: l.un }))
      });
    }

    if (action === 'session-revoke') {
      const sid = String(id || '');
      if (!sid.startsWith(`${auth.userId}:`)) return res.status(403).json({ error: 'Not your session.' });
      await Session.deleteOne({ _id: sid });
      await lg(0, 'session_revoke', auth.userId, { x: infoText(req) });
      return res.status(200).json({ ok: true });
    }

    if (action === 'sessions-revoke-others') {
      await Session.deleteMany({ u: auth.userId, _id: { $ne: `${auth.userId}:${auth.sid}` } });
      await lg(0, 'session_revoke', auth.userId, { x: 'all other devices' });
      return res.status(200).json({ ok: true });
    }

    if (action === 'password-change') {
      if (!(await hit(`pw:${auth.userId}`, 5, 600))) return tooMany();
      const u = await User.findById(auth.userId).select('p');
      if (!u || !(await bcrypt.compare(String(password || ''), u.p))) return res.status(400).json({ error: 'Your current password is wrong.' });
      const np = String(npw || '');
      if (np.length < 8 || np.length > 200) return res.status(400).json({ error: 'New password must be 8 to 200 characters.' });
      await User.updateOne({ _id: auth.userId }, { p: await bcrypt.hash(np, 12) });
      await Session.deleteMany({ u: auth.userId, _id: { $ne: `${auth.userId}:${auth.sid}` } });
      await lg(0, 'password_change', auth.userId, { x: infoText(req) });
      return res.status(200).json({ ok: true });
    }

    // ---------- reactions ----------
    if (action === 'react') {
      if (!(await hit(`rx:${auth.userId}`, 60, 60))) return tooMany();
      const emo = String(text || '').trim();
      if (!emo || emo.length > 16 || /[.$\s]/.test(emo)) return res.status(400).json({ error: 'Invalid emoji.' });
      const msg = await Msg.findById(Number(id)).lean();
      if (!msg || msg.d === 1) return res.status(404).json({ error: 'Message not found.' });
      const allowed = msg.s ? await isMember(msg.s, auth.userId) : ((msg.a === auth.userId || msg.b === auth.userId) && await areFriends(msg.a, msg.b));
      if (!allowed) return res.status(403).json({ error: 'You cannot react here.' });
      const rx = msg.rx || {}, has = (rx[emo] || []).includes(auth.userId);
      if (!has && !rx[emo] && Object.keys(rx).length >= 20) return res.status(400).json({ error: 'This message has too many different reactions.' });
      if (has) {
        await Msg.updateOne({ _id: msg._id }, { $pull: { [`rx.${emo}`]: auth.userId } });
        await Msg.updateOne({ _id: msg._id, [`rx.${emo}`]: { $size: 0 } }, { $unset: { [`rx.${emo}`]: '' } });
      } else await Msg.updateOne({ _id: msg._id }, { $addToSet: { [`rx.${emo}`]: auth.userId } });
      await lg(msg.s || 0, has ? 'unreact' : 'react', auth.userId, { u: msg.a, ch: msg.ch, x: emo });
      return res.status(200).json({ ok: true });
    }

    // ---------- audit log, voice time, moderation ----------
    if (action === 'audit-log') {
      if (!(await Server.exists({ _id: Number(id), o: auth.userId }))) return res.status(403).json({ error: 'Only the owner can view the audit log.' });
      const f = q === 'voice' ? /^voice_/ : q === 'channel' ? /^channel_/ : q === 'member' ? /^(member_|invite_)/ : q === 'message' ? /^message_/ : null;
      const logs = await Log.find({ s: Number(id), ...(f ? { ty: f } : {}) }).sort({ _id: -1 }).limit(150).lean();
      return res.status(200).json({ logs: logs.map(l => ({ id: l._id, t: l.t, ty: l.ty, an: l.an, un: l.un, cn: l.cn, d: l.d, x: l.x })) });
    }

    if (action === 'voice-stats') {
      if (!(await isMember(id, auth.userId))) return res.status(403).json({ error: 'Not a member.' });
      const sid = Number(id);
      const [rows, live, my] = await Promise.all([
        VStat.find({ s: sid }).sort({ t: -1 }).limit(25).lean(),
        Voice.find({ s: sid, ts: { $gt: vLive() } }).lean(),
        User.findById(auth.userId).select('vt mc').lean()
      ]);
      const liveSecs = {};
      for (const v of live) liveSecs[v._id] = Math.max(0, Math.round((nowSeconds() * 1000 - (v.j || v.ts * 1000)) / 1000));
      const stats = rows.map(r => ({ id: r.u, seconds: r.t + (liveSecs[r.u] || 0), sessions: r.n, last: r.last }));
      for (const uid of Object.keys(liveSecs)) if (!rows.some(r => r.u === Number(uid))) stats.push({ id: Number(uid), seconds: liveSecs[uid], sessions: 0, last: nowSeconds() });
      stats.sort((a, b) => b.seconds - a.seconds);
      const us = await User.find({ _id: { $in: stats.slice(0, 25).map(a => a.id) } }).select('n av pl pe').lean();
      const m = Object.fromEntries(us.map(u => [u._id, u]));
      return res.status(200).json({ mine: { voice: (my && my.vt) || 0, msgs: (my && my.mc) || 0 }, stats: stats.slice(0, 25).filter(a => m[a.id]).map(a => ({ id: a.id, username: m[a.id].n, avatar: m[a.id].av || '', plus: plusOn(m[a.id]), seconds: a.seconds, sessions: a.sessions, last: a.last })) });
    }

    if (action === 'voice-history') { // everyone's own recent voice sessions in a server; the log itself is permanent
      if (!(await isMember(id, auth.userId))) return res.status(403).json({ error: 'Not a member.' });
      const logs = await Log.find({ s: Number(id), a: auth.userId, ty: 'voice_leave' }).sort({ _id: -1 }).limit(50).lean();
      return res.status(200).json({ sessions: logs.map(l => ({ t: l.t, cn: l.cn, d: l.d })) });
    }

    if (action === 'member-kick') {
      const server = await Server.findOne({ _id: Number(id), o: auth.userId }).lean();
      if (!server) return res.status(403).json({ error: 'Only the owner can kick members.' });
      const uid = Number(to);
      if (uid === auth.userId || !server.m.includes(uid)) return res.status(400).json({ error: 'You cannot kick that member.' });
      await Server.updateOne({ _id: server._id }, { $pull: { m: uid } });
      const kv = await Voice.findOneAndDelete({ _id: uid, s: server._id }); if (kv) await endVoice(kv);
      await lg(server._id, 'member_kick', auth.userId, { u: uid });
      return res.status(200).json({ ok: true });
    }

    if (action === 'server-transfer') {
      const server = await Server.findOne({ _id: Number(id), o: auth.userId }).lean();
      if (!server) return res.status(403).json({ error: 'Only the owner can transfer this server.' });
      const uid = Number(to);
      if (uid === auth.userId || !server.m.includes(uid)) return res.status(400).json({ error: 'Pick another member of this server.' });
      const u = await User.findById(uid).select('n').lean();
      if (!u) return res.status(404).json({ error: 'User not found.' });
      await Server.updateOne({ _id: server._id }, { o: uid });
      await lg(server._id, 'server_transfer', auth.userId, { u: uid, x: u.n });
      return res.status(200).json({ ok: true, owner: uid, username: u.n });
    }

    // ---------- Pratr Plus (sold by hand in the Headquarters server) ----------
    if (action === 'hq-join') {
      const server = await Server.findById(Number(process.env.HQ_SERVER_ID || 1));
      if (!server) return res.status(404).json({ error: 'The Headquarters server is not set up yet.' });
      if (!server.m.includes(auth.userId)) { server.m.push(auth.userId); await server.save(); await lg(server._id, 'member_join', auth.userId, { x: 'public join' }); }
      return res.status(200).json({ server: srv(server) });
    }

    if (action === 'plus-grant') {
      const adm = await User.findById(auth.userId).select('e').lean();
      if (!adm || !isAdmin(adm.e)) return res.status(403).json({ error: 'Admins only.' });
      const qn = String(username || '').trim();
      const target = qn && await User.findOne({ $or: [{ n: qn }, { e: qn.toLowerCase() }] }).select('n pl pe ng ub').lean();
      if (!target) return res.status(404).json({ error: 'User not found.' });
      const now = nowSeconds();
      if (on === false) {
        await User.updateOne({ _id: target._id }, { $set: { pl: false, pe: now, ng: 0 } }); // credits are kept: boosts never expire
        await lg(0, 'plus_grant', auth.userId, { u: target._id, x: 'plan revoked' });
        return res.status(200).json({ username: target.n, plus: false, boosts: target.ub || 0 });
      }
      const len = Math.max(1, Math.min(366, Math.round(Number(days) || 30))); // the plan is 1 month by default
      const active = plusOn(target, now);
      const pe = (active ? Math.max(target.pe || 0, now) : now) + len * 86400;
      const update = { $set: { pl: true, pe } };
      if (!active) { update.$set.ng = now + MONTH; update.$inc = { ub: 2 }; } // month starts: 2 boosts
      await User.updateOne({ _id: target._id }, update);
      await lg(0, 'plus_grant', auth.userId, { u: target._id, x: `${active ? 'renewed' : '1-month plan started'} · ${len} days${active ? '' : ' · +2 overclocks'}` });
      return res.status(200).json({ username: target.n, plus: true, until: pe, days: len, boosts: (target.ub || 0) + (active ? 0 : 2), granted: active ? 0 : 2 });
    }

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

    if (action === 'activity') { // admin: everything one account has done (logins, profile edits, friends, status, plus)
      const adm = await User.findById(auth.userId).select('e').lean();
      if (!adm || !isAdmin(adm.e)) return res.status(403).json({ error: 'Admins only.' });
      const qn = String(username || '').trim();
      const u = qn && await User.findOne({ $or: [{ n: qn }, { e: qn.toLowerCase() }] }).select('n vt mc pl pe ub').lean();
      if (!u) return res.status(404).json({ error: 'User not found.' });
      const logs = await Log.find({ s: 0, $or: [{ a: u._id }, { u: u._id }] }).sort({ _id: -1 }).limit(100).lean();
      return res.status(200).json({ username: u.n, voice: u.vt || 0, msgs: u.mc || 0, plus: plusOn(u), plusUntil: u.pe || 0, boosts: u.ub || 0, logs: logs.map(l => ({ id: l._id, t: l.t, ty: l.ty, an: l.an, un: l.un, d: l.d, x: l.x, cn: l.cn })) });
    }

    // ---------- versioned migrations (admin, safe to call again) ----------
    if (action === 'migrate') {
      const adm = await User.findById(auth.userId).select('e').lean();
      if (!adm || !isAdmin(adm.e)) return res.status(403).json({ error: 'Admins only.' });
      const [m1, m2, m3, m4] = await Promise.all([Meta.findById('migrate1').lean(), Meta.findById('migrate2').lean(), Meta.findById('migrate3').lean(), Meta.findById('migrate4').lean()]);
      if (m1 && m1.v === 1 && m2 && m2.v === 1 && m3 && m3.v === 1 && m4 && m4.v === 1) return res.status(200).json({ ok: true, already: true, at: m4.at });
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
      await lg(0, 'migrate', auth.userId, { x: `vstats ${vstats}, vt ${vtSet}, mc ${mcSet}, friends ${fr.modifiedCount}, plans ${legacyPlans}, servers ${serverDefaults}, statuses ${statusDefaults}, assets ${serverAssets}` });
      return res.status(200).json({ ok: true, vstats, vtBackfilled: vtSet, mcBackfilled: mcSet, defaults, friendsBackfilled: fr.modifiedCount, planDefaults, legacyPlans, serverDefaults, statusDefaults, serverAssets });
    }

    // ---------- voice ----------
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
  } catch (err) {
    console.error('[auth error]', err);
    const internal = /^Mongo|^Mongoose|Cast|ValidationError/.test(String(err.name || '')) || /ECONN|buffering|timed out/i.test(String(err.message || ''));
    return res.status(500).json({ error: internal ? 'Something went wrong. Please try again.' : (err.message || 'Server error.') });
  }
};