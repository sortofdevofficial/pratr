const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

mongoose.set('bufferCommands', false);

const db = globalThis.__pratrDb || (globalThis.__pratrDb = { conn: null, promise: null });
const nowSeconds = () => Math.floor(Date.now() / 1000);
const onlineCut = () => nowSeconds() - 45; // seen within the last 45s = online
const statusOf = (u) => (u.ls || 0) > onlineCut() && u.ps !== 'invisible' ? (u.ps || 'online') : 'offline'; // what other people see

async function connectDB() {
  if (db.conn) return db.conn;
  if (!db.promise) {
    db.promise = mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000, maxPoolSize: 1 })
      .then(m => { db.conn = m; return m; })
      .catch(err => { db.promise = null; throw err; });
  }
  return db.promise;
}

const userSchema = new mongoose.Schema({
  _id: Number,
  e: { type: String, unique: true, lowercase: true, trim: true },
  p: String,
  n: { type: String, unique: true, sparse: true },
  o: Number,
  i: Number,
  b: String,
  av: String,
  ls: Number,
  ps: String
}, { versionKey: false });
const User = mongoose.models.User || mongoose.model('User', userSchema);

const pendingSchema = new mongoose.Schema({
  _id: String,
  p: String,
  o: String,
  un: String,
  x: Number
}, { versionKey: false });
const Pending = mongoose.models.Pending || mongoose.model('Pending', pendingSchema, 'pending');

const sessionSchema = new mongoose.Schema({
  _id: String,
  u: Number,
  i: String,
  d: String,
  s: Number
}, { versionKey: false });
const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema);

const msgSchema = new mongoose.Schema({
  _id: Number,
  a: Number,
  b: Number,
  s: Number,
  ch: Number,
  m: String,
  t: { type: Number, default: nowSeconds },
  d: { type: Number, default: 0 },
  dby: Number,
  dt: Number
}, { versionKey: false });
const Msg = mongoose.models.Msg || mongoose.model('Msg', msgSchema, 'msgs');

const serverSchema = new mongoose.Schema({
  _id: Number,
  n: String,
  o: Number,
  m: [Number],
  ic: String,
  ds: String,
  pub: Boolean,
  i: { type: String, unique: true }
}, { versionKey: false });
const Server = mongoose.models.Server || mongoose.model('Server', serverSchema, 'servers');

const channelSchema = new mongoose.Schema({
  _id: Number,
  s: Number,
  n: String,
  cat: { type: String, default: 'TEXT CHANNELS' },
  k: { type: String, default: 't' }, // 't' = text, 'v' = voice
  d: { type: Number, default: 0 }
}, { versionKey: false });
const Channel = mongoose.models.Channel || mongoose.model('Channel', channelSchema, 'channels');

// Voice presence: one row per connected user, refreshed ~1/s by the client. Rows older than VOICE_LIVE seconds are ignored.
const voiceSchema = new mongoose.Schema({ _id: Number, s: Number, ch: Number, ts: Number, j: Number, mu: Boolean, df: Boolean }, { versionKey: false });
const Voice = mongoose.models.Voice || mongoose.model('Voice', voiceSchema, 'voice');
// WebRTC signalling messages (offer/answer/ICE), consumed and deleted by the receiver's next poll.
const signalSchema = new mongoose.Schema({ to: Number, from: Number, d: String, x: Number }, { versionKey: false });
signalSchema.index({ to: 1 });
const Signal = mongoose.models.Signal || mongoose.model('Signal', signalSchema, 'signals');
const VOICE_LIVE = 15;
const vLive = () => nowSeconds() - VOICE_LIVE;
async function voiceRoom(sid, chId) {
  const vs = await Voice.find({ s: sid, ch: chId, ts: { $gt: vLive() } }).lean();
  const us = await User.find({ _id: { $in: vs.map(v => v._id) } }).select('n av').lean();
  const m = Object.fromEntries(us.map(u => [u._id, u]));
  return vs.filter(v => m[v._id]).map(v => ({ id: v._id, username: m[v._id].n, avatar: m[v._id].av || '', mu: !!v.mu, df: !!v.df, j: v.j || 0 }));
}

const friendSchema = new mongoose.Schema({
  _id: String,
  a: Number,
  b: Number,
  s: { type: String, default: 'a' }
}, { versionKey: false });
const Friend = mongoose.models.Friend || mongoose.model('Friend', friendSchema, 'friends');

// Invites are never removed: expiry (x) is only checked when someone tries to use one. x = 0 means it never expires.
const inviteSchema = new mongoose.Schema({
  _id: String,
  s: Number,
  by: Number,
  x: { type: Number, default: 0 },
  t: { type: Number, default: nowSeconds },
  u: { type: Number, default: 0 }
}, { versionKey: false });
const Invite = mongoose.models.Invite || mongoose.model('Invite', inviteSchema, 'invites');

const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789'; // no look-alike characters
const shortCode = () => Array.from({ length: 5 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('');

async function findInvite(code) {
  const inv = await Invite.findById(code).lean();
  if (inv) { const server = await Server.findById(inv.s); return server && { server, inv, expired: !!inv.x && inv.x < nowSeconds() }; }
  const server = await Server.findOne({ i: code }); // legacy permanent invite
  return server && { server, expired: false };
}

async function sendOtp(to, code) {
  const subject = 'Your pratr verification code';
  const text = `Your pratr verification code is ${code}. It expires in 10 minutes.`;
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px"><h2 style="margin:0 0 8px">Verify your email</h2><p style="color:#555;margin:0">Use this code to finish creating your pratr account:</p><p style="font-size:34px;letter-spacing:8px;font-weight:700;margin:18px 0">${code}</p><p style="color:#888;font-size:13px;margin:0">It expires in 10 minutes. If you didn't request it, you can ignore this email.</p></div>`;

  // Option A: Gmail (GMAIL_USER + GMAIL_APP_PASSWORD) or any SMTP server (SMTP_HOST/PORT/USER/PASS). Needs: npm install nodemailer
  let smtp = null;
  const gUser = String(process.env.GMAIL_USER || '').trim();
  const gPass = String(process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  if (gUser && gPass) {
    smtp = { host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: gUser, pass: gPass }, from: process.env.MAIL_FROM || `pratr <${gUser}>` };
  } else if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    const port = Number(process.env.SMTP_PORT || 465);
    smtp = { host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }, from: process.env.MAIL_FROM || process.env.SMTP_USER };
  }
  if (smtp) {
    let nodemailer;
    try { nodemailer = require('nodemailer'); }
    catch { throw new Error('Email is configured but the "nodemailer" package is missing. Run "npm install nodemailer", commit package.json and redeploy.'); }
    const transport = nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.secure, auth: smtp.auth });
    try {
      await transport.sendMail({ from: smtp.from, to, subject, text, html });
    } catch (err) {
      console.error('[smtp error]', err);
      let hint = String(err.response || err.message || 'unknown error');
      if (err.code === 'EAUTH' || /535|Username and Password not accepted|BadCredentials/i.test(hint)) hint = 'Gmail rejected the login. Use a Google App Password (needs 2-Step Verification turned on) in GMAIL_APP_PASSWORD, and make sure GMAIL_USER is the full Gmail address.';
      else if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKET' || err.code === 'ECONNECTION') hint = 'Could not connect to the mail server. Try again in a moment.';
      throw new Error(`Could not send verification email. ${hint}`);
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

const areFriends = async (x, y) => !!(await Friend.exists({ $or: [{ a: x, b: y }, { a: y, b: x }], s: 'a' }));

const isMember = async (serverId, userId) => !!(await Server.exists({ _id: Number(serverId), m: userId }));

const srv = (s) => ({ id: s._id, name: s.n, owner: s.o, count: s.m.length, icon: s.ic || '', desc: s.ds || '', pub: !!s.pub });
const okImg = (u) => u === '' || (typeof u === 'string' && u.startsWith(`https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/`));

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    let body = req.body || {};
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch {} }

    await connectDB();
    const { action, email, password, otp, id, username, text, kind, name, channelId, category, channelName, code, avatar, icon, bio, desc, pub, ttl, q, status, ck, to, sig, mu, df } = body;

    if (action === 'register') {
      const key = String(email || '').trim().toLowerCase();
      if (!key || !password) return res.status(400).json({ error: 'Email and password required.' });
      if (await User.exists({ e: key })) return res.status(400).json({ error: 'Email already registered.' });
      const uname = String(username || '').trim().slice(0, 20);
      if (uname && await User.exists({ n: uname })) return res.status(400).json({ error: 'Username taken.' });
      const codeStr = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      await Pending.updateOne({ _id: key }, { p: await bcrypt.hash(password, 10), o: await bcrypt.hash(codeStr, 8), un: uname, x: nowSeconds() + 600 }, { upsert: true });
      await sendOtp(key, codeStr);
      return res.status(200).json({ message: 'Code sent.', email: key });
    }

    if (action === 'verify') {
      const key = String(email || '').trim().toLowerCase();
      const pending = await Pending.findById(key).lean();
      if (!pending || pending.x < nowSeconds() || !(await bcrypt.compare(String(otp || ''), pending.o))) return res.status(400).json({ error: 'Invalid code.' });
      const userId = await nextId(User);
      const user = await User.create({ _id: userId, e: key, p: pending.p, n: pending.un || `user${userId}` });
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

    const authHeader = (req.headers && req.headers.authorization) || '';
    let auth = null;
    try { auth = authHeader.startsWith('Bearer ') ? jwt.verify(authHeader.slice(7), process.env.JWT_SECRET) : null; } catch { auth = null; }
    if (!auth || !(await Session.exists({ _id: `${auth.userId}:${auth.sid}` }))) return res.status(401).json({ error: 'Please log in again.' });

    if (action === 'logout') {
      await Session.deleteOne({ _id: `${auth.userId}:${auth.sid}` });
      return res.status(200).json({ ok: true });
    }

    if (action === 'me') {
      await User.updateOne({ _id: auth.userId }, { ls: nowSeconds() });
      const me = await User.findById(auth.userId).select('e n av b ps').lean();
      return res.status(200).json({ id: me._id, email: me.e, username: me.n, avatar: me.av || '', bio: me.b || '', status: me.ps || 'online' });
    }

    if (action === 'presence-set') {
      const st = ['online', 'idle', 'dnd', 'invisible'].includes(status) ? status : 'online';
      await User.updateOne({ _id: auth.userId }, { ps: st, ls: nowSeconds() });
      return res.status(200).json({ status: st });
    }

    if (action === 'profile-update') {
      const uname = String(username || '').trim().slice(0, 20);
      if (!uname) return res.status(400).json({ error: 'Username required.' });
      if (await User.exists({ n: uname, _id: { $ne: auth.userId } })) return res.status(400).json({ error: 'Username taken.' });
      if (!okImg(avatar ?? '')) return res.status(400).json({ error: 'Invalid image.' });
      const cleanBio = String(bio || '').trim().slice(0, 160);
      await User.updateOne({ _id: auth.userId }, { n: uname, av: avatar || '', b: cleanBio });
      return res.status(200).json({ username: uname, avatar: avatar || '', bio: cleanBio });
    }

    if (action === 'upload-sign') {
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
      return res.status(200).json({ server: srv(server) });
    }

    if (action === 'friend-add') {
      const q = String(username || '').trim();
      const other = await User.findOne({ $or: [{ n: q }, { e: q.toLowerCase() }] }).lean();
      if (!other) return res.status(404).json({ error: 'User not found.' });
      if (other._id === auth.userId) return res.status(400).json({ error: "You can't add yourself." });
      const [x, y] = [auth.userId, other._id].sort((p, q2) => p - q2);
      await Friend.updateOne({ _id: `${x}:${y}` }, { $setOnInsert: { a: x, b: y, s: 'a' } }, { upsert: true });
      return res.status(200).json({ friend: { id: other._id, username: other.n, email: other.e, avatar: other.av } });
    }

    if (action === 'server-join') {
      const found = await findInvite(String(code || ''));
      if (!found) return res.status(404).json({ error: 'Invalid invite.' });
      if (found.expired) return res.status(400).json({ error: 'This invite has expired.' });
      const { server, inv } = found;
      if (!server.m.includes(auth.userId)) {
        server.m.push(auth.userId); await server.save();
        if (inv) await Invite.updateOne({ _id: inv._id }, { $inc: { u: 1 } });
      }
      return res.status(200).json({ server: srv(server) });
    }

    if (action === 'invite-create') {
      const server = await Server.findOne({ _id: Number(id), m: auth.userId }).lean();
      if (!server) return res.status(403).json({ error: 'You are not a member of this server.' });
      const secs = Math.max(0, Math.min(Number(ttl) || 0, 31536000));
      const x = secs ? nowSeconds() + secs : 0;
      for (let tries = 0; tries < 5; tries++) {
        const newCode = shortCode();
        try { await Invite.create({ _id: newCode, s: server._id, by: auth.userId, x }); return res.status(200).json({ code: newCode, expires: x }); }
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
      if (!server.m.includes(auth.userId)) { server.m.push(auth.userId); await server.save(); }
      return res.status(200).json({ server: srv(server) });
    }

    // Soft delete: the message stays in the database, it is only hidden (d: 1).
    if (action === 'message-delete') {
      const msg = await Msg.findById(Number(id)).lean();
      if (!msg || msg.d === 1) return res.status(404).json({ error: 'Message not found.' });
      const isServerOwner = msg.s ? !!(await Server.exists({ _id: msg.s, o: auth.userId })) : false;
      if (msg.a !== auth.userId && !isServerOwner) return res.status(403).json({ error: "You can't delete this message." });
      await Msg.updateOne({ _id: msg._id }, { d: 1, dby: auth.userId, dt: nowSeconds() });
      return res.status(200).json({ ok: true });
    }

    if (action === 'friends') {
      const docs = await Friend.find({ $or: [{ a: auth.userId }, { b: auth.userId }], s: 'a' }).lean();
      const users = await User.find({ _id: { $in: docs.map(f => f.a === auth.userId ? f.b : f.a) } }).select('e n av b ls ps').lean();
      return res.status(200).json({ friends: users.map(u => ({ id: u._id, email: u.e, username: u.n, avatar: u.av, bio: u.b, status: statusOf(u) })) });
    }

    if (action === 'servers') {
      await User.updateOne({ _id: auth.userId }, { ls: nowSeconds() }); // polled every few seconds, doubles as presence
      const servers = await Server.find({ m: auth.userId }).lean();
      return res.status(200).json({ servers: servers.map(srv) });
    }

    if (action === 'server-create') {
      const cleanName = String(name || '').trim().slice(0, 60);
      if (!cleanName) return res.status(400).json({ error: 'Server name required.' });
      const serverId = await nextId(Server);
      const server = await Server.create({ _id: serverId, n: cleanName, o: auth.userId, m: [auth.userId], i: crypto.randomBytes(24).toString('hex') });
      await Channel.create({ _id: await nextId(Channel), s: serverId, n: 'general', cat: 'TEXT CHANNELS' });
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
      const chId = await nextId(Channel);
      const chName = String(channelName || '').trim().toLowerCase().replace(/\s+/g, '-');
      if (!chName) return res.status(400).json({ error: 'Channel name required.' });
      const k = ck === 'v' ? 'v' : 't';
      const cat = String(category || '').trim().slice(0, 40) || (k === 'v' ? 'VOICE CHANNELS' : 'TEXT CHANNELS');
      await Channel.create({ _id: chId, s: serverId, n: chName, cat, k });
      return res.status(200).json({ channel: { id: chId, name: chName, category: cat, kind: k } });
    }

    if (action === 'server-invite') {
      const server = await Server.findOne({ _id: Number(id), m: auth.userId }).lean();
      if (!server) return res.status(403).json({ error: 'You are not a member of this server.' });
      return res.status(200).json({ code: server.i });
    }

    if (action === 'members') {
      await User.updateOne({ _id: auth.userId }, { ls: nowSeconds() });
      const server = await Server.findOne({ _id: Number(id), m: auth.userId }).lean();
      if (!server) return res.status(403).json({ error: 'Not a member.' });
      const users = await User.find({ _id: { $in: server.m } }).select('n av b ls ps').lean();
      return res.status(200).json({ owner: server.o, members: users.map(u => ({ id: u._id, username: u.n, avatar: u.av, bio: u.b, status: statusOf(u), online: statusOf(u) !== 'offline' })) });
    }

    if (action === 'channel-delete') {
      const ch = await Channel.findById(Number(channelId)).lean();
      if (!ch || !(await Server.exists({ _id: ch.s, o: auth.userId }))) return res.status(403).json({ error: 'Only the owner can delete channels.' });
      await Channel.updateOne({ _id: ch._id }, { d: 1 }); // hidden, messages and channel stay in the database
      return res.status(200).json({ ok: true });
    }

    if (action === 'server-leave') {
      const server = await Server.findOne({ _id: Number(id), m: auth.userId }).lean();
      if (!server) return res.status(404).json({ error: 'Not a member.' });
      if (server.o === auth.userId) return res.status(400).json({ error: 'Owners cannot leave their own server.' });
      await Server.updateOne({ _id: server._id }, { $pull: { m: auth.userId } });
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
      const msgs = await Msg.find({ ...match, d: { $ne: 1 } }).sort({ _id: -1 }).limit(100).lean();
      const authors = await User.find({ _id: { $in: [...new Set(msgs.map(m => m.a))] } }).select('n av').lean();
      const people = Object.fromEntries(authors.map(u => [u._id, u]));
      return res.status(200).json({
        messages: msgs.reverse().map(m => ({ id: m._id, mine: m.a === auth.userId, text: m.m, t: m.t, author: { id: m.a, username: people[m.a]?.n || 'Unknown', avatar: people[m.a]?.av } }))
      });
    }

    if (action === 'send') {
      const clean = String(text || '').trim().slice(0, 2000);
      if (!clean) return res.status(400).json({ error: 'Empty message.' });
      let target;
      if (kind === 'server') {
        if (!(await isMember(id, auth.userId))) return res.status(403).json({ error: 'Not a member.' });
        if (!(await Channel.exists({ _id: Number(channelId), s: Number(id), k: { $ne: 'v' }, d: { $ne: 1 } }))) return res.status(400).json({ error: 'This server has no such text channel.' });
        target = { s: Number(id), ch: Number(channelId) };
      } else {
        if (!(await areFriends(auth.userId, Number(id)))) return res.status(403).json({ error: 'You can only message friends.' });
        target = { b: Number(id) };
      }
      const msg = await Msg.create({ _id: await nextId(Msg), a: auth.userId, ...target, m: clean });
      return res.status(200).json({ message: { id: msg._id, mine: true, text: msg.m, t: msg.t } });
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
      await Signal.deleteMany({ $or: [{ to: auth.userId }, { from: auth.userId }] });
      await Voice.updateOne({ _id: auth.userId }, { s: ch.s, ch: ch._id, ts: nowSeconds(), j: Date.now(), mu: !!mu, df: !!df }, { upsert: true });
      await User.updateOne({ _id: auth.userId }, { ls: nowSeconds() });
      return res.status(200).json({ peers: await voiceRoom(ch.s, ch._id) });
    }

    if (action === 'voice-sync') {
      const v = await Voice.findById(auth.userId).lean();
      if (!v) return res.status(404).json({ error: 'Not in voice.' });
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
      await Voice.deleteOne({ _id: auth.userId });
      await Signal.deleteMany({ $or: [{ to: auth.userId }, { from: auth.userId }] });
      return res.status(200).json({ ok: true });
    }

    if (action === 'voice-list') {
      if (!(await isMember(id, auth.userId))) return res.status(403).json({ error: 'Not a member.' });
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
    return res.status(500).json({ error: err.message || 'Server error.' });
  }
};