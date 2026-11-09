// The handler lives here; models, helpers and connection setup live in ../lib/core.js.
const { mongoose, bcrypt, jwt, crypto, nowSeconds, onlineCut, statusOf, clientIp, geoOf, deviceOf, clientInfo, infoText, hit, DUMMY_HASH, CURRENT_SCHEMA_VERSION, ensureSchemaVersion, withV, connectDB, User, Pending, Session, Msg, Server, Channel, Voice, VStat, Signal, Log, Read, Meta, Friend, Invite, lg, VOICE_LIVE, vLive, endVoice, reapMyVoice, reapVoice, readKey, voiceRoom, shortCode, findInvite, sendOtp, nextId, createWithId, isAdmin, areFriends, isMember, srv, okImg } = require('../lib/core');
const ACCENTS = ['#ffd36b', '#ff8fa3', '#7ee2b8', '#7cc4ff', '#b99bff', '#ffab6b', '#5ee0d6', '#f0e9db'];

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
    const { action, email, password, otp, id, username, text, kind, name, channelId, category, channelName, code, avatar, icon, bio, desc, pub, ttl, q, status, ck, to, sig, mu, df, on, npw, lastId, afterId, st, ac } = body;

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

    if (action === 'logout') {
      await Session.deleteOne({ _id: `${auth.userId}:${auth.sid}` });
      await lg(0, 'logout', auth.userId);
      return res.status(200).json({ ok: true });
    }

    if (action === 'me') {
      await reapMyVoice(auth.userId);
      await User.updateOne({ _id: auth.userId }, { ls: nowSeconds() });
      const me = await User.findById(auth.userId).select('e n av b ps pl st ac vt mc').lean();
      return res.status(200).json({ id: me._id, email: me.e, username: me.n, avatar: me.av || '', bio: me.b || '', status: me.ps || 'online', plus: !!me.pl, statusText: me.st || '', accent: me.ac || '', admin: isAdmin(me.e), voice: me.vt || 0, msgs: me.mc || 0 });
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
      const old = await User.findById(auth.userId).select('n av b pl st ac').lean();
      const plus = !!old.pl;
      const cleanBio = String(bio || '').trim().slice(0, plus ? 400 : 160);
      // Status and accent are Plus-only; for everyone else the stored values (if any) stay untouched.
      const cleanSt = plus ? String(st || '').trim().slice(0, 60) : (old.st || '');
      const cleanAc = plus && ACCENTS.includes(ac) ? ac : (old.ac || '');
      await User.updateOne({ _id: auth.userId }, { n: uname, av: avatar || '', b: cleanBio, st: cleanSt, ac: cleanAc });
      const diff = [old.n !== uname && `name ${old.n} → ${uname}`, (old.av || '') !== (avatar || '') && 'avatar changed', (old.b || '') !== cleanBio && 'bio changed', (old.st || '') !== cleanSt && `status “${cleanSt || 'cleared'}”`, (old.ac || '') !== cleanAc && 'accent changed'].filter(Boolean);
      if (diff.length) await lg(0, 'profile', auth.userId, { x: diff.join(', ') });
      return res.status(200).json({ username: uname, avatar: avatar || '', bio: cleanBio, statusText: cleanSt, accent: cleanAc });
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
      const server = await Server.findOneAndUpdate({ _id: Number(id), o: auth.userId }, { n: cleanName, ic: icon || '', ds: String(desc || '').trim().slice(0, 120), pub: !!pub }, { new: true }).lean();
      if (!server) return res.status(403).json({ error: 'Only the owner can edit the server.' });
      await lg(server._id, 'server_update', auth.userId, { x: `${cleanName}${pub ? ' (listed in Discover)' : ''}` });
      return res.status(200).json({ server: srv(server) });
    }

    if (action === 'friend-add') {
      if (!(await hit(`fr:${auth.userId}`, 20, 3600))) return tooMany();
      const q = String(username || '').trim();
      const other = await User.findOne({ $or: [{ n: q }, { e: q.toLowerCase() }] }).lean();
      if (!other) return res.status(404).json({ error: 'User not found.' });
      if (other._id === auth.userId) return res.status(400).json({ error: "You can't add yourself." });
      const [x, y] = [auth.userId, other._id].sort((p, q2) => p - q2);
      const key = `${x}:${y}`;
      const pair = (s) => ({ id: other._id, username: other.n, avatar: other.av || '', bio: other.b || '', status: statusOf(other), plus: !!other.pl, statusText: other.st || '', accent: other.ac || '', voice: other.vt || 0, msgs: other.mc || 0, s });
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
      const other = await User.findById(uid).select('n av b ls ps pl st ac vt mc').lean();
      if (!other) return res.status(404).json({ error: 'User not found.' });
      if (action === 'friend-accept') {
        if (doc.by === auth.userId) return res.status(403).json({ error: 'That request is yours — waiting for them.' });
        await Friend.updateOne({ _id: key }, { $set: { s: 'a', r: nowSeconds() } });
        await lg(0, 'friend_accept', auth.userId, { u: uid });
        return res.status(200).json({ friend: { id: other._id, username: other.n, avatar: other.av || '', bio: other.b || '', status: statusOf(other), plus: !!other.pl, statusText: other.st || '', accent: other.ac || '', voice: other.vt || 0, msgs: other.mc || 0 } });
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
      const users = await User.find({ _id: { $in: others } }).select('n av b ls ps pl st ac vt mc').lean();
      const um = Object.fromEntries(users.map(u => [u._id, u]));
      const row = (u, f) => ({ id: u._id, username: u.n, avatar: u.av || '', bio: u.b || '', status: statusOf(u), plus: !!u.pl, statusText: u.st || '', accent: u.ac || '', voice: u.vt || 0, msgs: u.mc || 0, t: f.t || 0 });
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
      const users = await User.find({ _id: { $in: server.m } }).select('n av b ls ps pl st ac vt mc').lean();
      return res.status(200).json({ owner: server.o, members: users.map(u => ({ id: u._id, username: u.n, avatar: u.av, bio: u.b, status: statusOf(u), plus: !!u.pl, statusText: u.st || '', accent: u.ac || '', online: statusOf(u) !== 'offline', voice: u.vt || 0, msgs: u.mc || 0 })) });
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
      const authors = await User.find({ _id: { $in: [...new Set(msgs.map(m => m.a))] } }).select('n av pl ac').lean();
      const people = Object.fromEntries(authors.map(u => [u._id, u]));
      return res.status(200).json({
        messages: msgs.reverse().map(m => ({ id: m._id, mine: m.a === auth.userId, text: m.m, t: m.t, rx: Object.entries(m.rx || {}).map(([e, a]) => ({ e, n: a.length, me: a.includes(auth.userId) })).filter(r => r.n), author: { id: m.a, username: people[m.a]?.n || 'Unknown', avatar: people[m.a]?.av, plus: !!people[m.a]?.pl, accent: people[m.a]?.ac || '' } }))
      });
    }

    if (action === 'send') {
      const isServer = kind === 'server';
      const [okRate, me, member, chanOk, friendOk] = await Promise.all([
        hit(`msg:${auth.userId}`, 20, 10),
        User.findById(auth.userId).select('n av pl ac').lean(),
        isServer ? isMember(id, auth.userId) : true,
        isServer ? Channel.exists({ _id: Number(channelId), s: Number(id), k: { $ne: 'v' }, d: { $ne: 1 } }) : true,
        isServer ? true : areFriends(auth.userId, Number(id))
      ]);
      if (!okRate) return res.status(429).json({ error: 'You are sending messages too fast.' });
      const clean = Array.from(String(text || '').trim()).slice(0, me && me.pl ? 4000 : 2000).join(''); // slice by character, never split an emoji
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
      return res.status(200).json({ message: { id: msg._id, mine: true, text: msg.m, t: msg.t, rx: [], author: { id: auth.userId, username: me?.n || 'You', avatar: me?.av, plus: !!me?.pl, accent: me?.ac || '' } } });
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
      const us = await User.find({ _id: { $in: stats.slice(0, 25).map(a => a.id) } }).select('n av pl').lean();
      const m = Object.fromEntries(us.map(u => [u._id, u]));
      return res.status(200).json({ mine: { voice: (my && my.vt) || 0, msgs: (my && my.mc) || 0 }, stats: stats.slice(0, 25).filter(a => m[a.id]).map(a => ({ id: a.id, username: m[a.id].n, avatar: m[a.id].av || '', plus: !!m[a.id].pl, seconds: a.seconds, sessions: a.sessions, last: a.last })) });
    }

    if (action === 'voice-history') { // Pratr Plus perk: your own recent voice sessions in a server
      const me = await User.findById(auth.userId).select('pl').lean();
      if (!me || !me.pl) return res.status(403).json({ error: 'Voice history is a Pratr Plus feature.' });
      if (!(await isMember(id, auth.userId))) return res.status(403).json({ error: 'Not a member.' });
      const logs = await Log.find({ s: Number(id), a: auth.userId, ty: 'voice_leave' }).sort({ _id: -1 }).limit(30).lean();
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
      const u = qn && await User.findOne({ $or: [{ n: qn }, { e: qn.toLowerCase() }] }).select('n').lean();
      if (!u) return res.status(404).json({ error: 'User not found.' });
      const yes = on !== false;
      await User.updateOne({ _id: u._id }, { pl: yes });
      await lg(0, 'plus_grant', auth.userId, { u: u._id, x: yes ? 'on' : 'off' });
      return res.status(200).json({ username: u.n, plus: yes });
    }

    if (action === 'activity') { // admin: everything one account has done (logins, profile edits, friends, status, plus)
      const adm = await User.findById(auth.userId).select('e').lean();
      if (!adm || !isAdmin(adm.e)) return res.status(403).json({ error: 'Admins only.' });
      const qn = String(username || '').trim();
      const u = qn && await User.findOne({ $or: [{ n: qn }, { e: qn.toLowerCase() }] }).select('n vt mc').lean();
      if (!u) return res.status(404).json({ error: 'User not found.' });
      const logs = await Log.find({ s: 0, $or: [{ a: u._id }, { u: u._id }] }).sort({ _id: -1 }).limit(100).lean();
      return res.status(200).json({ username: u.n, voice: u.vt || 0, msgs: u.mc || 0, logs: logs.map(l => ({ id: l._id, t: l.t, ty: l.ty, an: l.an, un: l.un, d: l.d, x: l.x, cn: l.cn })) });
    }

    // ---------- versioned migrations (admin, safe to call again) ----------
    if (action === 'migrate') {
      const adm = await User.findById(auth.userId).select('e').lean();
      if (!adm || !isAdmin(adm.e)) return res.status(403).json({ error: 'Admins only.' });
      const [m1, m2] = await Promise.all([Meta.findById('migrate1').lean(), Meta.findById('migrate2').lean()]);
      if (m1 && m1.v === 1 && m2 && m2.v === 1) return res.status(200).json({ ok: true, already: true, at: m2.at });
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
      await lg(0, 'migrate', auth.userId, { x: `vstats ${vstats}, vt ${vtSet}, mc ${mcSet}, friends ${fr.modifiedCount}` });
      return res.status(200).json({ ok: true, vstats, vtBackfilled: vtSet, mcBackfilled: mcSet, defaults, friendsBackfilled: fr.modifiedCount });
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