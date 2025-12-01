# Instructor Guide: LINE Bot Server Setup

## Quick Start (For Class)

### 1. Start the Server

**Option A: Double-click (Mac)**
```
Double-click: START_SERVER.command
```

**Option B: Terminal**
```bash
cd linebot-server
npm install
npm start
```

### 2. Expose to Internet (Required for LINE)

LINE needs a public URL. Use ngrok:

```bash
# Install ngrok (one time)
brew install ngrok

# In a new terminal, run:
ngrok http 3001
```

You'll see something like:
```
Forwarding: https://abc123.ngrok.io -> http://localhost:3001
```

**Copy the HTTPS URL** - this is what students will use!

### 3. Share with Students

Tell students:
1. Registration URL: `https://[your-ngrok-url]/admin.html`
2. Admin password: `sla2024` (or change it in .env)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         YOUR SERVER                              │
│                    (linebot-server/server.js)                   │
│                                                                 │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│   │  Student A  │  │  Student B  │  │  Student C  │            │
│   │  Speaking   │  │  Listening  │  │  Reading    │   ...      │
│   │  Bot        │  │  Bot        │  │  Bot        │            │
│   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘            │
│          │                │                │                    │
│          └────────────────┴────────────────┘                    │
│                           │                                     │
│                    ┌──────▼──────┐                              │
│                    │  Groq API   │                              │
│                    │  (LLaMA)    │                              │
│                    └─────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```

Each student has their own LINE Bot, but all use the same server.

---

## Server Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/admin.html` | GET | Student registration page |
| `/api/health` | GET | Health check |
| `/api/bots` | GET | List all registered bots |
| `/api/register` | POST | Register new bot |
| `/webhook/:botId` | POST | LINE webhook for each bot |

---

## Configuration

### .env File

```bash
# Groq API Key (already set)
GROQ_API_KEY=gsk_xxx...

# Server port
PORT=3001

# Admin password for registration
ADMIN_PASSWORD=sla2024
```

### Changing Admin Password

1. Edit `.env` file
2. Change `ADMIN_PASSWORD=your_new_password`
3. Restart server

---

## Monitoring

### View Registered Bots

Visit: `http://localhost:3001/api/bots`

Or check: `config/bots.json`

### Server Logs

The terminal shows all activity:
- Incoming messages
- AI responses
- Errors

---

## For Production Deployment

If you want a permanent server (not ngrok):

### Option 1: Render.com (Free)

1. Push code to GitHub
2. Connect to Render
3. Deploy as Web Service

### Option 2: Railway.app (Free tier)

1. Connect GitHub repo
2. Deploy with one click

### Option 3: Your University Server

Ask IT for a server with Node.js and public URL.

---

## Troubleshooting

### "GROQ_API_KEY not set"

1. Check `.env` file exists
2. Verify API key is correct

### "Webhook verification failed" (Student issue)

1. Check ngrok is running
2. Verify webhook URL is HTTPS
3. Check server is running

### Students can't register

1. Check admin password is correct
2. Verify server is accessible

---

## Classroom Workflow

### Before Class

1. Start server: `npm start`
2. Start ngrok: `ngrok http 3001`
3. Note the ngrok URL

### During Class

1. Share the ngrok URL + `/admin.html`
2. Share admin password
3. Walk through STUDENT_GUIDE.md

### After Class

- Bots remain registered in `config/bots.json`
- Students can use their bots anytime (if server is running)
- Consider deploying to Render for 24/7 access

---

## Quick Commands

```bash
# Start server
npm start

# Start ngrok (separate terminal)
ngrok http 3001

# View registered bots
cat config/bots.json

# Reset all bots (careful!)
echo '{"bots":{}}' > config/bots.json
```
