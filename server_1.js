// ═══════════════════════════════════════════════════════════
//  Travel With Ankur — OTP Backend
//  Node.js + Express + Twilio WhatsApp + JWT
// ═══════════════════════════════════════════════════════════

require('dotenv').config();          // loads .env file
const express    = require('express');
const cors       = require('cors');
const twilio     = require('twilio');
const jwt        = require('jsonwebtoken');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── MIDDLEWARE ──────────────────────────────────────────
app.use(cors({
  origin: '*',          // In production, set this to your frontend domain
  methods: ['GET','POST'],
  allowedHeaders: ['Content-Type','Authorization']
}));
app.use(express.json());

// ─── TWILIO CLIENT ───────────────────────────────────────
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// ─── IN-MEMORY OTP STORE ─────────────────────────────────
// Structure: { "919876543210": { otp: "123456", expiresAt: Date, attempts: 0, lastSent: Date } }
const otpStore = new Map();

// ─── CONSTANTS ───────────────────────────────────────────
const OTP_EXPIRY_MS     = 5 * 60 * 1000;   // 5 minutes
const RESEND_COOLDOWN_MS = 30 * 1000;       // 30 seconds between resends
const MAX_VERIFY_TRIES  = 5;                // lock after 5 wrong tries
const JWT_SECRET        = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';
const JWT_EXPIRY        = '7d';             // token valid for 7 days

// ─── HELPER: Generate 6-digit OTP ────────────────────────
function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ─── HELPER: Validate Indian mobile ─────────────────────
function isValidIndianPhone(phone) {
  return /^[6-9]\d{9}$/.test(phone);
}

// ─── HELPER: WhatsApp number format ──────────────────────
function toWhatsAppNumber(phone) {
  // Twilio format: whatsapp:+919876543210
  return `whatsapp:+91${phone}`;
}

// ═══════════════════════════════════════════════════════════
//  ROUTE: POST /send-otp
//  Body: { phone: "9876543210" }
// ═══════════════════════════════════════════════════════════
app.post('/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;

    // ── Validate ──
    if (!phone || !isValidIndianPhone(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Indian phone number. Must be 10 digits starting with 6-9.'
      });
    }

    const key        = `91${phone}`;
    const existing   = otpStore.get(key);
    const now        = Date.now();

    // ── Rate limit: prevent spam (30s cooldown) ──
    if (existing && (now - existing.lastSent) < RESEND_COOLDOWN_MS) {
      const waitSec = Math.ceil((RESEND_COOLDOWN_MS - (now - existing.lastSent)) / 1000);
      return res.status(429).json({
        success: false,
        message: `Please wait ${waitSec} seconds before requesting a new OTP.`
      });
    }

    // ── Generate OTP ──
    const otp = generateOTP();

    // ── Store OTP ──
    otpStore.set(key, {
      otp,
      expiresAt: now + OTP_EXPIRY_MS,
      attempts:  0,
      lastSent:  now
    });

    // ── Send via Twilio WhatsApp ──
    const message = await twilioClient.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,   // e.g. "whatsapp:+14155238886"
      to:   toWhatsAppNumber(phone),
      body: `🌏 *Travel With Ankur*\n\nYour OTP is: *${otp}*\n\nValid for 5 minutes. Do not share this with anyone.\n\n_Powered by Travel With Ankur_`
    });

    console.log(`✅ OTP sent to +91${phone} | SID: ${message.sid}`);

    return res.status(200).json({
      success: true,
      message: 'OTP sent to WhatsApp successfully!',
      // DO NOT return OTP in production — this is only for local testing:
      // debug_otp: process.env.NODE_ENV === 'development' ? otp : undefined
    });

  } catch (err) {
    console.error('❌ Error sending OTP:', err);

    // Twilio-specific error handling
    if (err.code === 21614) {
      return res.status(400).json({ success: false, message: 'This number is not on WhatsApp.' });
    }
    if (err.code === 20003) {
      return res.status(500).json({ success: false, message: 'Twilio authentication failed. Check your credentials.' });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to send OTP. Please try again.',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// ═══════════════════════════════════════════════════════════
//  ROUTE: POST /verify-otp
//  Body: { phone: "9876543210", otp: "123456" }
// ═══════════════════════════════════════════════════════════
app.post('/verify-otp', (req, res) => {
  try {
    const { phone, otp } = req.body;

    // ── Validate inputs ──
    if (!phone || !isValidIndianPhone(phone)) {
      return res.status(400).json({ success: false, message: 'Invalid phone number.' });
    }
    if (!otp || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ success: false, message: 'OTP must be 6 digits.' });
    }

    const key    = `91${phone}`;
    const record = otpStore.get(key);

    // ── Check OTP exists ──
    if (!record) {
      return res.status(400).json({
        success: false,
        message: 'No OTP found for this number. Please request a new OTP.'
      });
    }

    // ── Check expiry ──
    if (Date.now() > record.expiresAt) {
      otpStore.delete(key);
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new one.'
      });
    }

    // ── Check max attempts ──
    if (record.attempts >= MAX_VERIFY_TRIES) {
      otpStore.delete(key);
      return res.status(400).json({
        success: false,
        message: 'Too many wrong attempts. Please request a new OTP.'
      });
    }

    // ── Verify OTP ──
    if (record.otp !== otp) {
      record.attempts++;
      const left = MAX_VERIFY_TRIES - record.attempts;
      return res.status(400).json({
        success: false,
        message: `Incorrect OTP. ${left} attempt(s) remaining.`
      });
    }

    // ── SUCCESS: Clean up OTP ──
    otpStore.delete(key);

    // ── Issue JWT ──
    const token = jwt.sign(
      { phone: `91${phone}`, loginAt: Date.now() },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    console.log(`✅ OTP verified for +91${phone}`);

    return res.status(200).json({
      success: true,
      message: 'OTP verified successfully!',
      token
    });

  } catch (err) {
    console.error('❌ Error verifying OTP:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again.',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// ═══════════════════════════════════════════════════════════
//  ROUTE: GET /verify-token  (optional: frontend can call this to validate JWT)
//  Header: Authorization: Bearer <token>
// ═══════════════════════════════════════════════════════════
app.get('/verify-token', (req, res) => {
  const auth  = req.headers.authorization;
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;

  if (!token) return res.status(401).json({ valid: false, message: 'No token provided.' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return res.json({ valid: true, phone: payload.phone });
  } catch {
    return res.status(401).json({ valid: false, message: 'Invalid or expired token.' });
  }
});

// ─── HEALTH CHECK ────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// ─── START SERVER ─────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Travel With Ankur — OTP Server running on port ${PORT}`);
  console.log(`📡 Health: http://localhost:${PORT}/health\n`);
});
