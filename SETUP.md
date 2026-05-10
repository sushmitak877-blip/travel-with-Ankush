# 🌏 Travel With Ankur — Login System Setup Guide

Complete step-by-step guide to set up WhatsApp OTP login for your travel website.

---

## 📁 File Structure

```
travel-login/
├── index.html          ← Your frontend (replace your existing index.html)
├── server.js           ← Node.js backend
├── package.json        ← Node dependencies
├── .env.example        ← Environment variables template
└── SETUP.md            ← This guide
```

---

## STEP 1 — Twilio Account Setup

### 1.1 Create a Twilio Account
1. Go to **https://www.twilio.com** and sign up (free)
2. Verify your email and phone number
3. Go to your **Console Dashboard**
4. Note down:
   - `Account SID` (starts with `AC...`)
   - `Auth Token` (click to reveal)

### 1.2 Enable WhatsApp Sandbox
1. In Twilio Console, go to **Messaging → Try it out → Send a WhatsApp message**
2. You'll see a sandbox number like `+1 415 523 8886`
3. **Each user must join your sandbox first** by sending this message from their WhatsApp:
   ```
   join [your-sandbox-keyword]
   ```
   (e.g., `join found-river`) — Twilio shows the exact phrase
4. After joining, OTPs will be delivered to that number

> **For Production**: Apply for a WhatsApp Business number through Twilio. This removes the sandbox requirement. See: https://www.twilio.com/whatsapp/request-access

---

## STEP 2 — Local Setup

### 2.1 Install Node.js
Download from **https://nodejs.org** (v18 or higher)

### 2.2 Install Dependencies
```bash
cd travel-login
npm install
```

### 2.3 Configure Environment Variables
```bash
# Copy the template
cp .env.example .env

# Edit .env with your values
nano .env     # or use any text editor
```

Fill in your `.env`:
```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
JWT_SECRET=some-very-long-random-string-here
PORT=3000
NODE_ENV=development
```

### 2.4 Run the Backend
```bash
npm run dev     # with auto-restart on file changes (nodemon)
# OR
npm start       # plain node
```

You should see:
```
🚀 Travel With Ankur — OTP Server running on port 3000
📡 Health: http://localhost:3000/health
```

### 2.5 Open the Frontend
Just open `index.html` in your browser (double-click it), or use Live Server in VS Code.

---

## STEP 3 — Test Locally

1. Open `index.html` in browser
2. Click **"View Details"** on any card
3. Login popup appears
4. Enter your WhatsApp-registered Indian mobile number (10 digits)
5. Click **Send OTP on WhatsApp**
6. Check your WhatsApp — you'll receive: `Your OTP is: 123456`
7. Enter the 6-digit OTP
8. Click **Verify OTP**
9. ✅ You're logged in! The details page will open.

---

## STEP 4 — Deploy to Production

### 4.1 Deploy Backend on Render (Free)

1. Push your project to **GitHub**
2. Go to **https://render.com** → New → Web Service
3. Connect your GitHub repo
4. Settings:
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Environment**: Node
5. Add Environment Variables (Render dashboard → Environment tab):
   ```
   TWILIO_ACCOUNT_SID = your_value
   TWILIO_AUTH_TOKEN  = your_value
   TWILIO_WHATSAPP_FROM = whatsapp:+14155238886
   JWT_SECRET         = your_long_secret
   NODE_ENV           = production
   ```
6. Deploy! You'll get a URL like: `https://travel-otp.onrender.com`

### 4.2 Deploy Backend on Railway (Alternative)

1. Go to **https://railway.app** → New Project → Deploy from GitHub
2. Add environment variables in the Variables tab
3. Railway auto-detects Node.js and deploys
4. Get your URL from the Settings tab

### 4.3 Update Frontend

In `index.html`, find this line and update it:
```javascript
const BACKEND_URL = 'http://localhost:3000';
```
Change to your deployed backend URL:
```javascript
const BACKEND_URL = 'https://your-app.onrender.com';
```

### 4.4 Deploy Frontend on Netlify

1. Go to **https://netlify.com** → Add new site → Deploy manually
2. Drag and drop your entire project folder
3. Your site is live! Or connect GitHub for automatic deploys.

---

## STEP 5 — How the Code Works

### Frontend Flow
```
User clicks "View Details"
        ↓
isLoggedIn() checks localStorage
        ↓
NOT logged in → show login modal
        ↓
User enters phone → POST /send-otp
        ↓
OTP boxes appear
        ↓
User enters OTP → POST /verify-otp
        ↓
Server returns JWT token
        ↓
Save token + phone in localStorage
        ↓
Redirect to details page ✅
```

### Backend OTP Flow
```
POST /send-otp
  → Validate phone number
  → Check 30s cooldown (anti-spam)
  → Generate random 6-digit OTP
  → Store in memory Map with 5-min expiry
  → Send via Twilio WhatsApp API
  → Return success

POST /verify-otp
  → Get stored OTP for that phone
  → Check not expired (5 min)
  → Check attempts < 5 (anti-brute-force)
  → Compare OTPs
  → If match: delete OTP, return JWT token
  → If wrong: increment attempts counter
```

### Session (localStorage)
```javascript
// After login:
localStorage.setItem('auth_token', token);  // JWT
localStorage.setItem('auth_phone', phone);  // "9876543210"

// On page load:
if (localStorage.getItem('auth_token')) { /* logged in */ }

// Logout:
localStorage.removeItem('auth_token');
localStorage.removeItem('auth_phone');
```

---

## STEP 6 — Protect Details Pages (Optional)

Add this code at the **top** of each details page (`risk.html`, `manali.html`, etc.):

```html
<script>
  // Add this BEFORE any other script
  (function() {
    const token = localStorage.getItem('auth_token');
    const phone = localStorage.getItem('auth_phone');
    if (!token || !phone) {
      // Not logged in → redirect to home with a flag
      window.location.href = 'index.html?auth=required';
    }
  })();
</script>
```

Then in `index.html`, detect the flag and auto-open login:
```javascript
// In DOMContentLoaded:
const params = new URLSearchParams(window.location.search);
if (params.get('auth') === 'required') {
  openModal();
}
```

---

## API Reference

### POST /send-otp
```json
// Request
{ "phone": "9876543210" }

// Success (200)
{ "success": true, "message": "OTP sent to WhatsApp successfully!" }

// Error (400)
{ "success": false, "message": "Invalid Indian phone number." }

// Rate limited (429)
{ "success": false, "message": "Please wait 25 seconds before requesting a new OTP." }
```

### POST /verify-otp
```json
// Request
{ "phone": "9876543210", "otp": "123456" }

// Success (200)
{ "success": true, "message": "OTP verified successfully!", "token": "eyJ..." }

// Wrong OTP (400)
{ "success": false, "message": "Incorrect OTP. 4 attempt(s) remaining." }

// Expired (400)
{ "success": false, "message": "OTP has expired. Please request a new one." }
```

---

## Security Features

| Feature | Implementation |
|---|---|
| OTP expiry | 5 minutes (configurable) |
| Anti-spam | 30s cooldown between sends |
| Brute-force protection | Max 5 wrong attempts → OTP deleted |
| JWT auth | 7-day token expiry |
| Phone validation | India format only (6-9 XXXXXXXXXX) |
| HTTPS | Use HTTPS in production (Render/Railway auto-handles) |

---

## Common Issues & Fixes

**"Cannot reach server. Is the backend running?"**
→ Make sure `npm run dev` is running and `BACKEND_URL` in index.html matches

**"This number is not on WhatsApp"**
→ The number must have an active WhatsApp account

**"Twilio authentication failed"**
→ Check your `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` in `.env`

**Sandbox: OTP not received**
→ The user must first join the sandbox by sending `join [keyword]` to `+14155238886`

**OTP received but shows wrong**
→ Make sure you're entering exactly the 6 digits (no spaces)

---

## Need Help?

- Twilio Docs: https://www.twilio.com/docs/whatsapp
- Render Docs: https://render.com/docs
- Open an issue on GitHub
