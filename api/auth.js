const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

mongoose.set('bufferCommands', false);

const db = globalThis.__pratrDb || (globalThis.__pratrDb = { conn: null, promise: null });
const nowSeconds = () => Math.floor(Date.now() / 1000);

async function connectDB() {
  if (db.conn) return db.conn;
  if (!db.promise) {
    db.promise = mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000, maxPoolSize: 1 })
      .then(m => { db.conn = m; return m; })
      .catch(err => { db.promise = null; throw err; });
  }
  return db.promise;
}

/* ---------------- schemas ---------------- */
const userSchema = new mongoose.Schema({
  _id: Number,
  e: { type: String, unique: true, lowercase: true, trim: true },
  p: String,
  n: { type: String, unique: true, sparse: true },
  o: Number,
  i: Number,
  b: String,
  av: String,            // avatar data URL
  bio: { type: String, default: '' },
  st: { type: String, default: 'online' },   // chosen status
  ls: { type: Number, default: 0 }           // last seen (unix seconds)
}, { versionKey: false });
const User = mongoose.models.User || mongoose.model('User', userSchema);

const pendingSchema = new mongoose.Schema({ _id: String, p: String, o: String, un: String, x: Number }, { versionKey: false });
const Pending = mongoose.models.Pending || mongoose.model('Pending', pendingSchema, 'pending');

const sessionSchema = new mongoose.Schema({ _id: String, u: Number, i: String, d: String, s: Number }, { versionKey: false });
const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema);

const rxSchema = new mongoose.Schema({ e: String, u: [Number] }, { _id: false });
const msgSchema = new mongoose.Schema({
  _id: Number, a: Number, b: Number, s: Number, ch: Number, m: String,
  t: { type: Number, default: nowSeconds },
  d: { type: Number, default: 0 },
  ed: { type: Number, default: 0 },
  rp: Number,
  rx: { type: [rxSchema], default: [] }
}, { versionKey: false });
const Msg = mongoose.models.Msg || mongoose.model('Msg', msgSchema, 'msgs');

const serverSchema = new mongoose.Schema({
  _id: Number, n: String, o: Number, m: [Number],
  i: { type: String, unique: true },
  ic: { type: String, default: '' }
}, { versionKey: false });
const Server = mongoose.models.Server || mongoose.model('Server', serverSchema, 'servers');

const channelSchema = new mongoose.Schema({
  _id: Number, s: Number, n: String,
  cat: { type: String, default: 'TEXT CHANNELS' },
  tp: { type: String, default: '' }
}, { versionKey: false });
const Channel = mongoose.models.Channel || mongoose.model('Channel', channelSchema, 'channels');

const friendSchema = new mongoose.Schema({
  _id: String, a: Number, b: Number,
  s: { type: String, default: 'a' },  // 'a' accepted, 'p' pending
  r: Number                            // requester (pending only)
}, { versionKey: false });
const Friend = mongoose.models.Friend || mongoose.model('Friend', friendSchema, 'friends');

/* ---------------- helpers ---------------- */
async function sendOtp(to, code) {
  const subject = 'Your pratr verification code';
  const text = `Your pratr verification code is ${code}. It expires in 10 minutes.`;
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px"><h2 style="margin:0 0 8px">Verify your email</h2><p style="color:#555;margin:0">Use this code to finish creating your pratr account:</p><p style="font-size:34px;letter-spacing:8px;font-weight:700;margin:18px 0">${code}</p><p style="color:#888;font-size:13px;margin:0">It expires in 10 minutes. If you didn't request it, you can ignore this email.</p></div>`;

  // Option A: any SMTP server (Gmail app password, Brevo, Mailgun, ...). Needs: npm install nodemailer
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    let nodemailer;
    try { nodemailer = require('nodemailer'); }
    catch { throw new Error('SMTP is configured but the "nodemailer" package is missing. Add it with: npm install nodemailer'); }
    const port = Number(process.env.SMTP_PORT || 465);
    const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
    try {
      await transport.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text, html });
    } catch (err) {
      console.error('[smtp error]', err);
      throw new Error(`Could not send verification email (SMTP: ${err.response || err.message}).`);
    }
    return;
  }

  // Option B: Resend
  if (!process.env.RESEND_API_KEY) { console.log(`[OTP] ${to}: ${code}`); return; }
  let r;
  try {
    r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: (process.env.MAIL_FROM || 'pratr <onboarding@resend.dev>').trim(), to: [to], subject, text, html })
    });
  } catch (err) {
    console.error('[resend network error]', err);
    throw new Error('Could not reach the email service. Try again in a moment.');
  }
  if (!r.ok) {
    const info = await r.json().catch(() => ({}));
    console.error('[resend error]', r.status, JSON.stringify(info));
    const msg = String(info.message || info.error || `HTTP ${r.status}`);
    let hint = msg;
    if (/own email|testing emails|only send/i.test(msg)) hint = 'Resend only lets the default sender email your own Resend account address. Verify a domain in Resend and set MAIL_FROM (e.g. "pratr <noreply@yourdomain.com>"), or use SMTP.';
    else if (/api key/i.test(msg) || r.status === 401) hint = 'RESEND_API_KEY is missing or invalid. Check it in Vercel and redeploy.';
    else if (/domain|from/i.test(msg)) hint = `The sender address is not allowed: ${msg} Check MAIL_FROM and that its domain is verified in Resend.`;
    else if (r.status === 429) hint = 'Email rate limit reached. Wait a moment and try again.';
    throw new Error(`Could not send verification email. ${hint}`);
  }
}

async function nextId(Model) {
  const last = await Model.findOne().sort({ _id: -1 }).select('_id').lean();
  return (last ? last._id : 0) + 1;
}

const USER_FIELDS = 'n av bio st ls';
const presence = (u) => {
  const on = u.ls && u.ls > nowSeconds() - 90;
  if (!on || u.st === 'invisible') return 'offline';
  return u.st || 'online';
};
const pub = (u) => ({ id: u._id, username: u.n, avatar: u.av || '', bio: u.bio || '', status: presence(u) });
const validImg = (v) => typeof v === 'string' && v.length <= 140000 && /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v);
const pairKey = (x, y) => { const [p, q] = [x, y].sort((m, n) => m - n); return { _id: `${p}:${q}`, a: p, b: q }; };
const findFriend = (x, y) => Friend.findOne({ $or: [{ a: x, b: y }, { a: y, b: x }] });
const areFriends = async (x, y) => !!(await Friend.exists({ $or: [{ a: x, b: y }, { a: y, b: x }], s: 'a' }));
const isMember = async (serverId, userId) => !!(await Server.exists({ _id: Number(serverId), m: userId }));
const serverDto = (s) => ({ id: s._id, name: s.n, owner: s.o, count: s.m.length, icon: s.ic || '' });
const chanDto = (c) => ({ id: c._id, name: c.n, category: c.cat, topic: c.tp || '' });

async function canAccessMsg(msg, uid) {
  if (msg.s) return isMember(msg.s, uid);
  return msg.a === uid || msg.b === uid;
}

/* ---------------- handler ---------------- */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    let body = req.body || {};
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch {} }

    await connectDB();
    const { action, email, password, newPassword, otp, id, username, text, kind, name, channelId, category, channelName, topic, code,
      userId, msgId, emoji, replyTo, bio, avatar, status, icon } = body;

    /* ----- public ----- */
    if (action === 'register') {
      const key = String(email || '').trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(key)) return res.status(400).json({ error: 'Enter a valid email.' });
      if (!password || String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
      if (await User.exists({ e: key })) return res.status(400).json({ error: 'Email already registered.' });
      const uname = String(username || '').trim();
      if (uname && !/^[\w .-]{2,20}$/.test(uname)) return res.status(400).json({ error: 'Username must be 2–20 characters.' });
      if (uname && await User.exists({ n: uname })) return res.status(400).json({ error: 'Username taken.' });
      const codeStr = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      await Pending.updateOne({ _id: key }, { p: await bcrypt.hash(String(password), 10), o: await bcrypt.hash(codeStr, 8), un: uname, x: nowSeconds() + 600 }, { upsert: true });
      await sendOtp(key, codeStr);
      return res.status(200).json({ message: 'Code sent.', email: key });
    }

    if (action === 'verify') {
      const key = String(email || '').trim().toLowerCase();
      const pending = await Pending.findById(key).lean();
      if (!pending || pending.x < nowSeconds() || !(await bcrypt.compare(String(otp || ''), pending.o))) return res.status(400).json({ error: 'Invalid or expired code.' });
      const userIdNew = await nextId(User);
      const user = await User.create({ _id: userIdNew, e: key, p: pending.p, n: pending.un || `user${userIdNew}`, ls: nowSeconds() });
      await Pending.deleteOne({ _id: key });
      const sid = crypto.randomBytes(12).toString('hex');
      await Session.create({ _id: `${user._id}:${sid}`, u: user._id, s: nowSeconds() });
      const token = jwt.sign({ userId: user._id, sid }, process.env.JWT_SECRET, { expiresIn: '7d' });
      return res.status(200).json({ token, email: user.e, id: user._id });
    }

    if (action === 'login') {
      const key = String(email || '').trim().toLowerCase();
      const user = await User.findOne({ e: key });
      if (!user || !(await bcrypt.compare(String(password || ''), user.p))) return res.status(401).json({ error: 'Invalid credentials.' });
      const sid = crypto.randomBytes(12).toString('hex');
      await Session.create({ _id: `${user._id}:${sid}`, u: user._id, s: nowSeconds() });
      const token = jwt.sign({ userId: user._id, sid }, process.env.JWT_SECRET, { expiresIn: '7d' });
      return res.status(200).json({ token, email: user.e, id: user._id });
    }

    /* ----- authenticated ----- */
    const authHeader = (req.headers && req.headers.authorization) || '';
    let auth = null;
    try { auth = authHeader.startsWith('Bearer ') ? jwt.verify(authHeader.slice(7), process.env.JWT_SECRET) : null; } catch { auth = null; }
    if (!auth || !(await Session.exists({ _id: `${auth.userId}:${auth.sid}` }))) return res.status(401).json({ error: 'Please log in again.' });
    const me = auth.userId;

    if (action === 'ping' || action === 'friends' || action === 'servers') await User.updateOne({ _id: me }, { ls: nowSeconds() });
    if (action === 'ping') return res.status(200).json({ ok: true });

    if (action === 'logout') {
      await Session.deleteOne({ _id: `${me}:${auth.sid}` });
      return res.status(200).json({ ok: true });
    }

    /* ----- profile ----- */
    if (action === 'me') {
      const u = await User.findById(me).select('e n av bio st').lean();
      return res.status(200).json({ id: u._id, email: u.e, username: u.n, avatar: u.av || '', bio: u.bio || '', status: u.st || 'online' });
    }

    if (action === 'user') {
      const u = await User.findById(Number(userId)).select(USER_FIELDS).lean();
      if (!u) return res.status(404).json({ error: 'User not found.' });
      return res.status(200).json({ user: pub(u) });
    }

    if (action === 'profile-update') {
      const u = await User.findById(me);
      if (username !== undefined) {
        const n = String(username).trim();
        if (!/^[\w .-]{2,20}$/.test(n)) return res.status(400).json({ error: 'Username must be 2–20 characters (letters, numbers, space, . _ -).' });
        if (n !== u.n && await User.exists({ n })) return res.status(400).json({ error: 'Username taken.' });
        u.n = n;
      }
      if (bio !== undefined) u.bio = String(bio).slice(0, 190);
      if (avatar !== undefined) {
        if (!avatar) u.av = '';
        else if (validImg(avatar)) u.av = avatar;
        else return res.status(400).json({ error: 'Invalid or too large image.' });
      }
      if (status !== undefined && ['online', 'idle', 'dnd', 'invisible'].includes(status)) u.st = status;
      await u.save();
      return res.status(200).json({ id: u._id, email: u.e, username: u.n, avatar: u.av || '', bio: u.bio || '', status: u.st || 'online' });
    }

    if (action === 'password-change') {
      const u = await User.findById(me);
      if (!(await bcrypt.compare(String(password || ''), u.p))) return res.status(400).json({ error: 'Current password is incorrect.' });
      if (!newPassword || String(newPassword).length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
      u.p = await bcrypt.hash(String(newPassword), 10);
      await u.save();
      await Session.deleteMany({ u: me, _id: { $ne: `${me}:${auth.sid}` } });
      return res.status(200).json({ ok: true });
    }

    /* ----- friends ----- */
    if (action === 'friends') {
      const docs = await Friend.find({ $or: [{ a: me }, { b: me }], s: 'a' }).lean();
      const users = await User.find({ _id: { $in: docs.map(f => f.a === me ? f.b : f.a) } }).select(USER_FIELDS).lean();
      return res.status(200).json({ friends: users.map(pub) });
    }

    if (action === 'friend-requests') {
      const docs = await Friend.find({ $or: [{ a: me }, { b: me }], s: 'p' }).lean();
      const users = await User.find({ _id: { $in: docs.map(f => f.a === me ? f.b : f.a) } }).select(USER_FIELDS).lean();
      const map = Object.fromEntries(users.map(u => [u._id, pub(u)]));
      const incoming = [], outgoing = [];
      docs.forEach(f => { const other = f.a === me ? f.b : f.a; if (!map[other]) return; (f.r === me ? outgoing : incoming).push(map[other]); });
      return res.status(200).json({ incoming, outgoing });
    }

    if (action === 'friend-add') {
      const q = String(username || '').trim();
      if (!q) return res.status(400).json({ error: 'Enter a username or email.' });
      const other = await User.findOne({ $or: [{ n: q }, { e: q.toLowerCase() }] }).lean();
      if (!other) return res.status(404).json({ error: 'User not found.' });
      if (other._id === me) return res.status(400).json({ error: "You can't add yourself." });
      const ex = await findFriend(me, other._id);
      if (ex) {
        if (ex.s === 'a') return res.status(400).json({ error: 'You are already friends.' });
        if (ex.r === me) return res.status(400).json({ error: 'Request already sent.' });
        ex.s = 'a'; await ex.save();
        return res.status(200).json({ status: 'accepted', user: pub(other) });
      }
      await Friend.create({ ...pairKey(me, other._id), s: 'p', r: me });
      return res.status(200).json({ status: 'sent', user: pub(other) });
    }

    if (action === 'friend-accept') {
      const f = await findFriend(me, Number(userId));
      if (!f || f.s !== 'p' || f.r === me) return res.status(404).json({ error: 'No such request.' });
      f.s = 'a'; await f.save();
      return res.status(200).json({ ok: true });
    }

    if (action === 'friend-decline' || action === 'friend-remove') {
      const f = await findFriend(me, Number(userId));
      if (!f) return res.status(404).json({ error: 'Not found.' });
      await Friend.deleteOne({ _id: f._id });
      return res.status(200).json({ ok: true });
    }

    /* ----- servers ----- */
    if (action === 'servers') {
      const servers = await Server.find({ m: me }).sort({ _id: 1 }).lean();
      return res.status(200).json({ servers: servers.map(serverDto) });
    }

    if (action === 'server-create') {
      const cleanName = String(name || '').trim().slice(0, 60);
      if (!cleanName) return res.status(400).json({ error: 'Server name required.' });
      if (icon && !validImg(icon)) return res.status(400).json({ error: 'Invalid or too large image.' });
      const serverId = await nextId(Server);
      const server = await Server.create({ _id: serverId, n: cleanName, o: me, m: [me], i: crypto.randomBytes(24).toString('hex'), ic: icon || '' });
      await Channel.create({ _id: await nextId(Channel), s: serverId, n: 'general', cat: 'TEXT CHANNELS' });
      return res.status(200).json({ server: serverDto(server) });
    }

    if (action === 'server-update') {
      const server = await Server.findOne({ _id: Number(id), o: me });
      if (!server) return res.status(403).json({ error: 'Only the owner can edit the server.' });
      if (name !== undefined) { const n = String(name).trim().slice(0, 60); if (!n) return res.status(400).json({ error: 'Server name required.' }); server.n = n; }
      if (icon !== undefined) { if (!icon) server.ic = ''; else if (validImg(icon)) server.ic = icon; else return res.status(400).json({ error: 'Invalid or too large image.' }); }
      await server.save();
      return res.status(200).json({ server: serverDto(server) });
    }

    if (action === 'server-delete') {
      const server = await Server.findOne({ _id: Number(id), o: me }).lean();
      if (!server) return res.status(403).json({ error: 'Only the owner can delete the server.' });
      await Promise.all([Server.deleteOne({ _id: server._id }), Channel.deleteMany({ s: server._id }), Msg.deleteMany({ s: server._id })]);
      return res.status(200).json({ ok: true });
    }

    if (action === 'server-leave') {
      const server = await Server.findOne({ _id: Number(id), m: me }).lean();
      if (!server) return res.status(404).json({ error: 'Not a member.' });
      if (server.o === me) return res.status(400).json({ error: 'Owners cannot leave their own server. Delete it instead.' });
      await Server.updateOne({ _id: server._id }, { $pull: { m: me } });
      return res.status(200).json({ ok: true });
    }

    if (action === 'server-kick') {
      const server = await Server.findOne({ _id: Number(id), o: me });
      if (!server) return res.status(403).json({ error: 'Only the owner can remove members.' });
      if (Number(userId) === me) return res.status(400).json({ error: "You can't remove yourself." });
      server.m = server.m.filter(x => x !== Number(userId));
      await server.save();
      return res.status(200).json({ ok: true });
    }

    if (action === 'server-invite') {
      const server = await Server.findOne({ _id: Number(id), m: me }).lean();
      if (!server) return res.status(403).json({ error: 'You are not a member of this server.' });
      return res.status(200).json({ code: server.i });
    }

    if (action === 'server-join') {
      const server = await Server.findOne({ i: String(code || '') });
      if (!server) return res.status(404).json({ error: 'Invalid invite.' });
      if (!server.m.includes(me)) { server.m.push(me); await server.save(); }
      return res.status(200).json({ server: serverDto(server) });
    }

    if (action === 'members') {
      const server = await Server.findOne({ _id: Number(id), m: me }).lean();
      if (!server) return res.status(403).json({ error: 'Not a member.' });
      const users = await User.find({ _id: { $in: server.m } }).select(USER_FIELDS).lean();
      return res.status(200).json({ owner: server.o, members: users.map(pub) });
    }

    /* ----- channels ----- */
    if (action === 'channels') {
      if (!(await isMember(id, me))) return res.status(403).json({ error: 'Not a member.' });
      const chans = await Channel.find({ s: Number(id) }).sort({ _id: 1 }).lean();
      return res.status(200).json({ channels: chans.map(chanDto) });
    }

    if (action === 'channel-create') {
      const serverId = Number(id);
      if (!(await Server.exists({ _id: serverId, o: me }))) return res.status(403).json({ error: 'Only the owner can create channels.' });
      const chName = String(channelName || '').trim().toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 40);
      if (!chName) return res.status(400).json({ error: 'Channel name required.' });
      const ch = await Channel.create({ _id: await nextId(Channel), s: serverId, n: chName, cat: String(category || 'TEXT CHANNELS').trim().toUpperCase().slice(0, 40), tp: String(topic || '').slice(0, 120) });
      return res.status(200).json({ channel: chanDto(ch) });
    }

    if (action === 'channel-update') {
      const ch = await Channel.findById(Number(channelId));
      if (!ch || !(await Server.exists({ _id: ch.s, o: me }))) return res.status(403).json({ error: 'Only the owner can edit channels.' });
      if (channelName !== undefined) { const n = String(channelName).trim().toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 40); if (!n) return res.status(400).json({ error: 'Channel name required.' }); ch.n = n; }
      if (category !== undefined) ch.cat = String(category || 'TEXT CHANNELS').trim().toUpperCase().slice(0, 40);
      if (topic !== undefined) ch.tp = String(topic).slice(0, 120);
      await ch.save();
      return res.status(200).json({ channel: chanDto(ch) });
    }

    if (action === 'channel-delete') {
      const ch = await Channel.findById(Number(channelId)).lean();
      if (!ch || !(await Server.exists({ _id: ch.s, o: me }))) return res.status(403).json({ error: 'Only the owner can delete channels.' });
      await Channel.deleteOne({ _id: ch._id });
      await Msg.deleteMany({ s: ch.s, ch: ch._id });
      return res.status(200).json({ ok: true });
    }

    /* ----- messages ----- */
    if (action === 'messages') {
      const isServer = kind === 'server';
      let match, owner = null;
      if (isServer) {
        const server = await Server.findOne({ _id: Number(id), m: me }).select('o').lean();
        if (!server) return res.status(403).json({ error: 'Not a member.' });
        if (!(await Channel.exists({ _id: Number(channelId), s: Number(id) }))) return res.status(404).json({ error: 'Channel not found.' });
        match = { s: Number(id), ch: Number(channelId) }; owner = server.o;
      } else {
        if (!(await areFriends(me, Number(id)))) return res.status(403).json({ error: 'You can only message friends.' });
        match = { $or: [{ a: me, b: Number(id) }, { a: Number(id), b: me }] };
      }
      const msgs = await Msg.find({ ...match, d: { $ne: 1 } }).sort({ _id: -1 }).limit(100).lean();
      const rpIds = [...new Set(msgs.map(m => m.rp).filter(Boolean))];
      const rps = rpIds.length ? await Msg.find({ _id: { $in: rpIds } }).select('a m d').lean() : [];
      const rpMap = Object.fromEntries(rps.map(r => [r._id, r]));
      const uids = [...new Set([...msgs.map(m => m.a), ...rps.map(r => r.a)])];
      const us = await User.find({ _id: { $in: uids } }).select(USER_FIELDS).lean();
      const users = Object.fromEntries(us.map(u => [u._id, pub(u)]));
      return res.status(200).json({
        owner, users,
        messages: msgs.reverse().map(m => {
          const r = m.rp && rpMap[m.rp];
          return {
            id: m._id, mine: m.a === me, text: m.m, t: m.t, ed: m.ed || 0, author: m.a,
            reply: r ? (r.d ? { id: r._id, deleted: true } : { id: r._id, author: r.a, text: String(r.m || '').slice(0, 120) }) : null,
            rx: (m.rx || []).filter(x => x.u.length).map(x => ({ e: x.e, n: x.u.length, me: x.u.includes(me) }))
          };
        })
      });
    }

    if (action === 'send') {
      const clean = String(text || '').trim().slice(0, 2000);
      if (!clean) return res.status(400).json({ error: 'Empty message.' });
      let target;
      if (kind === 'server') {
        if (!(await isMember(id, me))) return res.status(403).json({ error: 'Not a member.' });
        if (!(await Channel.exists({ _id: Number(channelId), s: Number(id) }))) return res.status(400).json({ error: 'This server has no such text channel.' });
        target = { s: Number(id), ch: Number(channelId) };
      } else {
        if (!(await areFriends(me, Number(id)))) return res.status(403).json({ error: 'You can only message friends.' });
        target = { b: Number(id) };
      }
      let rp;
      if (replyTo) { const orig = await Msg.findById(Number(replyTo)).lean(); if (orig && !orig.d && await canAccessMsg(orig, me)) rp = orig._id; }
      const msg = await Msg.create({ _id: await nextId(Msg), a: me, ...target, m: clean, ...(rp ? { rp } : {}) });
      return res.status(200).json({ message: { id: msg._id, mine: true, text: msg.m, t: msg.t } });
    }

    if (action === 'msg-edit') {
      const msg = await Msg.findById(Number(msgId));
      if (!msg || msg.d === 1 || msg.a !== me) return res.status(403).json({ error: 'You can only edit your own messages.' });
      const clean = String(text || '').trim().slice(0, 2000);
      if (!clean) return res.status(400).json({ error: 'Message cannot be empty.' });
      msg.m = clean; msg.ed = nowSeconds(); await msg.save();
      return res.status(200).json({ ok: true });
    }

    if (action === 'msg-delete') {
      const msg = await Msg.findById(Number(msgId));
      if (!msg || msg.d === 1) return res.status(404).json({ error: 'Message not found.' });
      const owner = msg.s ? await Server.exists({ _id: msg.s, o: me }) : false;
      if (msg.a !== me && !owner) return res.status(403).json({ error: 'You cannot delete this message.' });
      msg.d = 1; await msg.save();
      return res.status(200).json({ ok: true });
    }

    if (action === 'msg-react') {
      const msg = await Msg.findById(Number(msgId));
      if (!msg || msg.d === 1 || !(await canAccessMsg(msg, me))) return res.status(404).json({ error: 'Message not found.' });
      const e = String(emoji || '').slice(0, 8);
      if (!e) return res.status(400).json({ error: 'Emoji required.' });
      const r = msg.rx.find(x => x.e === e);
      if (!r) { if (msg.rx.length >= 20) return res.status(400).json({ error: 'Too many reactions.' }); msg.rx.push({ e, u: [me] }); }
      else { const i = r.u.indexOf(me); if (i >= 0) r.u.splice(i, 1); else r.u.push(me); }
      msg.rx = msg.rx.filter(x => x.u.length);
      msg.markModified('rx');
      await msg.save();
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Invalid action.' });
  } catch (err) {
    console.error('[auth error]', err);
    if (err && err.code === 11000) return res.status(400).json({ error: 'That value is already taken.' });
    return res.status(500).json({ error: err.message || 'Server error.' });
  }
};