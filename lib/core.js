const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

mongoose.set('bufferCommands', false);

const db = globalThis.__pratrDb || (globalThis.__pratrDb = { conn: null, promise: null });
const nowSeconds = () => Math.floor(Date.now() / 1000);
const onlineCut = () => nowSeconds() - 45; // seen within the last 45s = online
const statusOf = (u) => (u.ls || 0) > onlineCut() && u.ps !== 'invisible' ? (u.ps || 'online') : 'offline'; // what other people see

// ---------- security helpers ----------
const clientIp = (req) => String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || '').split(',')[0].trim().slice(0, 64) || 'unknown';
const geoOf = (req) => { const hd = req.headers || {}, dec = (v) => { try { return decodeURIComponent(v || ''); } catch { return ''; } }; return [dec(hd['x-vercel-ip-city']), hd['x-vercel-ip-country']].filter(Boolean).join(', '); };
function deviceOf(ua) {
  ua = String(ua || '');
  const b = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const o = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'unknown OS';
  return `${b} on ${o}`;
}
const clientInfo = (req) => { const ua = String((req.headers && req.headers['user-agent']) || ''); return { i: clientIp(req), li: clientIp(req), d: deviceOf(ua), ua: ua.slice(0, 300), c: geoOf(req), ls: nowSeconds() }; };
const infoText = (req) => { const c = clientInfo(req); return `${c.i} · ${c.d}${c.c ? ' · ' + c.c : ''}`; };
// Rate limiting kept in MongoDB so it works across serverless instances.
const Rate = mongoose.models.Rate || mongoose.model('Rate', new mongoose.Schema({ _id: String, n: Number, x: Number }, { versionKey: false }), 'rl');
async function hit(key, limit, windowSec) {
  const t = nowSeconds();
  const r = await Rate.findOneAndUpdate({ _id: key, x: { $gt: t } }, { $inc: { n: 1 } }, { new: true }).lean();
  if (r) return r.n <= limit;
  await Rate.updateOne({ _id: key }, { n: 1, x: t + windowSec }, { upsert: true });
  if (Math.random() < 0.02) Rate.deleteMany({ x: { $lt: t } }).catch(() => {});
  return true;
}
const DUMMY_HASH = bcrypt.hashSync('pratr-dummy', 10); // compared when the email is unknown so timing does not reveal it

// ---------- schema version (for future migrations) ----------
// Every collection below carries a small "v" field set to CURRENT_SCHEMA_VERSION on write.
// A future migration script can find old documents with `{ v: { $lt: N } }` (or missing) and upgrade them in place,
// so the app never has to assume every row was written by today's code.
const CURRENT_SCHEMA_VERSION = 5;
const Meta = mongoose.models.Meta || mongoose.model('Meta', new mongoose.Schema({ _id: String, v: Number, at: Number }, { versionKey: false }), 'meta');
let schemaStamped = false;
async function ensureSchemaVersion() {
  if (schemaStamped) return;
  await Meta.updateOne({ _id: 'schema' }, { $set: { v: CURRENT_SCHEMA_VERSION }, $setOnInsert: { at: nowSeconds() } }, { upsert: true });
  schemaStamped = true;
}
const withV = (doc) => ({ ...doc, v: CURRENT_SCHEMA_VERSION });

async function connectDB() {
  if (db.conn) { ensureSchemaVersion().catch(() => {}); return db.conn; }
  if (!db.promise) {
    db.promise = mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000, maxPoolSize: 5 })
      .then(m => { db.conn = m; return m; })
      .catch(err => { db.promise = null; throw err; });
  }
  const conn = await db.promise;
  await ensureSchemaVersion().catch(() => {});
  return conn;
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
  ps: String,
  pl: Boolean, // Pratr Plus
  pe: Number, // Plus ends at (epoch seconds); 0/absent = no expiry on legacy rows
  ng: Number, // next monthly boost grant at (epoch seconds)
  ub: Number, // unused server boosts (never expire)
  st: String, // custom status (everyone)
  sx: Number, // status expires at (epoch seconds); 0/absent = never
  ac: String, // accent colour (Plus)
  pg: String, // profile glow colour (Plus)
  vt: Number, // total seconds in voice, all servers
  mc: Number // messages sent
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
  i: String, // IP at login
  d: String, // device label, e.g. Chrome on Windows
  s: Number, // signed in at
  li: String, // last seen IP
  ua: String, // raw user agent
  c: String, // approximate place (city, country)
  ls: Number // last active
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
  dt: Number,
  rx: mongoose.Schema.Types.Mixed // reactions: { emoji: [userIds] }
}, { versionKey: false });
msgSchema.index({ s: 1, ch: 1, _id: 1 }); // server channel history
msgSchema.index({ a: 1, b: 1, _id: 1 }); // DM history
const Msg = mongoose.models.Msg || mongoose.model('Msg', msgSchema, 'msgs');

const serverSchema = new mongoose.Schema({
  _id: Number,
  n: String,
  o: Number,
  m: [Number],
  ic: String,
  ds: String,
  pub: Boolean,
  bc: { type: Number, default: 0 }, // flares applied (never decrease)
  bp: { type: [String], default: [] }, // perk keys the owner has enabled
  sc: String, // server accent colour (accent perk)
  bn: String, // animated banner image (banner perk)
  lg: String, // server logo image (logo perk)
  em: { type: [{ n: String, u: String, _id: false }], default: [] }, // custom emoji (emoji perk)
  sk: { type: [{ n: String, u: String, _id: false }], default: [] }, // stickers (sticker perk)
  i: { type: String, unique: true }
}, { versionKey: false });
serverSchema.index({ m: 1 });
const Server = mongoose.models.Server || mongoose.model('Server', serverSchema, 'servers');

const MONTH = 30 * 24 * 60 * 60; // one Pratr Plus month
// A Plus plan is active only while it is paid up. Legacy rows without pe keep working until the migration gives them a month.
const plusOn = (u, now = nowSeconds()) => !!u && u.pl === true && (!u.pe || u.pe > now);
// Server perks unlocked by flares. Owners turn each one on from the Flares & perks panel.
const BOOST_PERKS = [
  { k: 'accent', n: 'Accent colour', at: 1, d: 'Show a custom colour on the server name.' },
  { k: 'banner', n: 'Animated banner', at: 2, d: 'A moving banner across the top of the server and in Discover.' },
  { k: 'desc', n: 'Long description', at: 3, d: 'Write up to 300 characters for Discover.' },
  { k: 'logo', n: 'Server logo', at: 4, d: 'A wide logo and glowing ring for the server name.' },
  { k: 'longmsg', n: 'Longer messages', at: 5, d: 'Everyone in this server can send up to 4,000 characters.' },
  { k: 'badge', n: 'Gold flare badge', at: 6, d: 'A gold flare badge on the server icon.' },
  { k: 'emoji', n: 'Custom emoji', at: 8, d: 'Upload up to 50 emoji that anyone here can use as :name:.' },
  { k: 'sticker', n: 'Stickers', at: 10, d: 'Upload up to 30 stickers and send them as big images.' }
];
const boostTier = (n) => BOOST_PERKS.filter(p => (n || 0) >= p.at).length;

// One row per applied boost. Rows are never deleted, so a server's boosts and its history are permanent.
const boostSchema = new mongoose.Schema({ _id: Number, u: Number, s: Number, t: { type: Number, default: nowSeconds } }, { versionKey: false });
boostSchema.index({ s: 1, t: -1 });
boostSchema.index({ u: 1, t: -1 });
const Boost = mongoose.models.Boost || mongoose.model('Boost', boostSchema, 'boosts');

const channelSchema = new mongoose.Schema({
  _id: Number,
  s: Number,
  n: String,
  cat: { type: String, default: 'TEXT CHANNELS' },
  k: { type: String, default: 't' }, // 't' = text, 'v' = voice
  d: { type: Number, default: 0 }
}, { versionKey: false });
channelSchema.index({ s: 1 });
const Channel = mongoose.models.Channel || mongoose.model('Channel', channelSchema, 'channels');

// Voice presence: one row per connected user, refreshed ~1/s by the client. Rows older than VOICE_LIVE seconds are ignored.
const voiceSchema = new mongoose.Schema({ _id: Number, s: Number, ch: Number, ts: Number, j: Number, mu: Boolean, df: Boolean }, { versionKey: false });
voiceSchema.index({ s: 1, ts: 1 });
voiceSchema.index({ s: 1, ch: 1, ts: 1 });
const Voice = mongoose.models.Voice || mongoose.model('Voice', voiceSchema, 'voice');
// Organized voice totals: one row per user per server. Updated when a session ends; logs keep the session-by-session history.
const vstatSchema = new mongoose.Schema({ _id: String, s: Number, u: Number, t: Number, n: Number, last: Number }, { versionKey: false });
vstatSchema.index({ s: 1, t: -1 });
const VStat = mongoose.models.VStat || mongoose.model('VStat', vstatSchema, 'vstats');
// WebRTC signalling messages (offer/answer/ICE), consumed and deleted by the receiver's next poll.
const signalSchema = new mongoose.Schema({ to: Number, from: Number, d: String, x: Number }, { versionKey: false });
signalSchema.index({ to: 1 });
const Signal = mongoose.models.Signal || mongoose.model('Signal', signalSchema, 'signals');
// Audit log: every important server event is stored forever (never deleted). Names are copied in so old entries stay readable.
const logSchema = new mongoose.Schema({ s: Number, t: { type: Number, default: nowSeconds }, ty: String, a: Number, an: String, u: Number, un: String, ch: Number, cn: String, d: Number, x: String }, { versionKey: false });
logSchema.index({ s: 1, ty: 1, t: -1 });
const Log = mongoose.models.Log || mongoose.model('Log', logSchema, 'logs');
async function lg(s, ty, a, o = {}) {
  try {
    const ids = [a, o.u].filter(x => x != null);
    const us = ids.length ? await User.find({ _id: { $in: ids } }).select('n').lean() : [];
    const nm = Object.fromEntries(us.map(u => [u._id, u.n]));
    await Log.create({ s, ty, a, an: nm[a] || '', u: o.u, un: nm[o.u] || '', ch: o.ch, cn: o.cn || '', d: o.d || 0, x: String(o.x || '').slice(0, 300) });
  } catch (e) { console.error('[log]', e); }
}
const VOICE_LIVE = 15;
const vLive = () => nowSeconds() - VOICE_LIVE;
// Closes a voice session in the log. endTs (seconds) is used for sessions that just stopped sending heartbeats.
async function endVoice(v, endTs) {
  const secs = Math.max(0, Math.round(((endTs || nowSeconds()) * 1000 - (v.j || v.ts * 1000)) / 1000));
  const ch = await Channel.findById(v.ch).select('n').lean();
  await lg(v.s, 'voice_leave', v._id, { ch: v.ch, cn: ch ? ch.n : '', d: secs });
  await Promise.all([
    User.updateOne({ _id: v._id }, { $inc: { vt: secs } }),
    VStat.updateOne({ _id: `${v.s}:${v._id}` }, { $inc: { t: secs, n: 1 }, $max: { last: nowSeconds() }, $set: { s: v.s, u: v._id } }, { upsert: true })
  ]);
}
// A tab that died without saying goodbye: close its session the next time that user does anything.
async function reapMyVoice(uid) {
  const v = await Voice.findOneAndDelete({ _id: uid, ts: { $lte: vLive() } });
  if (v) await endVoice(v, v.ts);
}
async function reapVoice(sid) {
  const stale = await Voice.find({ s: sid, ts: { $lte: vLive() } }).lean();
  for (const r of stale) { const v = await Voice.findOneAndDelete({ _id: r._id, ts: { $lte: vLive() } }); if (v) await endVoice(v, v.ts); }
}
// Read state: one row per user per channel/DM, so unread dots and ping counts survive restarts and work across devices.
const readSchema = new mongoose.Schema({ _id: String, u: Number, mid: Number, v: Number }, { versionKey: false });
readSchema.index({ u: 1 });
const Read = mongoose.models.Read || mongoose.model('Read', readSchema, 'reads');
const readKey = (u, kind, id, chId) => kind === 'server' ? `${u}:s${id}:${chId}` : `${u}:d${id}`;

async function voiceRoom(sid, chId) {
  const vs = await Voice.find({ s: sid, ch: chId, ts: { $gt: vLive() } }).lean();
  const us = await User.find({ _id: { $in: vs.map(v => v._id) } }).select('n av').lean();
  const m = Object.fromEntries(us.map(u => [u._id, u]));
  return vs.filter(v => m[v._id]).map(v => ({ id: v._id, username: m[v._id].n, avatar: m[v._id].av || '', mu: !!v.mu, df: !!v.df, j: v.j || 0 }));
}

// One row per pair, keyed "lo:hi". s = p pending / a accepted / d denied. by = who sent the request,
// t = when it was sent, r = when it was answered. Denied rows are kept as history; asking again flips them back to pending.
const friendSchema = new mongoose.Schema({
  _id: String,
  a: Number,
  b: Number,
  s: { type: String, default: 'p' },
  by: { type: Number, default: 0 },
  t: { type: Number, default: nowSeconds },
  r: { type: Number, default: 0 }
}, { versionKey: false });
friendSchema.index({ a: 1, s: 1 });
friendSchema.index({ b: 1, s: 1 });
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
// max+1 ids can collide when two requests create at once; retry with a fresh id instead of failing.
const pause = (ms) => new Promise(r => setTimeout(r, ms));
async function createWithId(Model, doc) {
  for (let tries = 0; tries < 8; tries++) {
    try { return await Model.create({ ...doc, _id: await nextId(Model) }); }
    catch (e) {
      const kp = e.keyPattern || (e.errorResponse && e.errorResponse.keyPattern);
      if (e.code !== 11000 || !(kp && kp._id) || tries === 7) throw e;
      await pause(10 + tries * 15 + Math.floor(Math.random() * 25)); // desync concurrent writers so they stop colliding
    }
  }
}

const isAdmin = (e) => String(process.env.ADMIN_EMAILS || 'sortofdevofficial@gmail.com').toLowerCase().split(',').map(s => s.trim()).filter(Boolean).includes(String(e || '').toLowerCase());
const areFriends = async (x, y) => !!(await Friend.exists({ $or: [{ a: x, b: y }, { a: y, b: x }], s: 'a' }));

const isMember = async (serverId, userId) => !!(await Server.exists({ _id: Number(serverId), m: userId }));

const srv = (s) => ({ id: s._id, name: s.n, owner: s.o, count: s.m.length, icon: s.ic || '', desc: s.ds || '', pub: !!s.pub, boosts: s.bc || 0, tier: boostTier(s.bc), perks: s.bp || [], accent: s.sc || '', banner: s.bn || '', logo: s.lg || '', emoji: s.em || [], stickers: s.sk || [] });
// Status text is shown to everyone and disappears on its own when it expires.
const stOf = (u, now = nowSeconds()) => (u && u.st && (!u.sx || u.sx > now)) ? u.st : '';
const okImg = (u) => u === '' || (typeof u === 'string' && u.startsWith(`https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/`));

module.exports = { mongoose, bcrypt, jwt, crypto, nowSeconds, onlineCut, statusOf, stOf, clientIp, geoOf, deviceOf, clientInfo, infoText, hit, DUMMY_HASH, CURRENT_SCHEMA_VERSION, ensureSchemaVersion, withV, connectDB, User, Pending, Session, Msg, Server, Channel, Voice, VStat, Signal, Log, Read, Meta, Friend, Invite, Boost, lg, VOICE_LIVE, vLive, endVoice, reapMyVoice, reapVoice, readKey, voiceRoom, shortCode, findInvite, sendOtp, nextId, createWithId, isAdmin, areFriends, isMember, srv, okImg, MONTH, plusOn, BOOST_PERKS, boostTier };
