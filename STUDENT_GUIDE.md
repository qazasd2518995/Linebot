# LINE Bot Setup Guide for Students

## Create Your Personal Language Learning Coach on LINE

---

## Overview

By the end of this guide, you will have:
- Your own LINE Bot that anyone can add as a friend
- Your custom SLA Strategy Coach running 24/7
- A tool you can share with future students

**Estimated Time: 15-20 minutes**

---

## Prerequisites

Before you start, make sure you have:
- [ ] A LINE account (personal LINE app)
- [ ] Your System Prompt from the SLA Chatbot Builder
- [ ] The admin password (ask your instructor)

---

## Step 1: Create a LINE Official Account (5 minutes)

### 1.1 Go to LINE Official Account Creation Page

Open your browser and go to:
```
https://www.linebiz.com/jp/entry/
```

Or click "Create a LINE Official Account" button in LINE Developers Console.

### 1.2 Log in with LINE

- Click "LINEアカウントでログイン" (Log in with LINE account)
- Use your personal LINE account credentials
- Approve the permissions

### 1.3 Fill in Account Information

| Field | What to Enter |
|-------|---------------|
| **Account Name** | Your bot's name (e.g., "Speaking Coach - John") |
| **Company/Store Category** | Select "Education" → "School" |
| **Business Type** | Select "Other" or "Education" |

### 1.4 Complete Registration

- Accept the terms
- Click "Create Account" / "アカウントを作成"
- You'll be redirected to LINE Official Account Manager

---

## Step 2: Enable Messaging API (3 minutes)

### 2.1 Open LINE Official Account Manager

After creating the account, you should be in the Official Account Manager.
If not, go to: https://manager.line.biz/

### 2.2 Go to Settings

1. Click **Settings** (設定) in the right sidebar
2. Click **Messaging API** in the left menu

### 2.3 Enable Messaging API

1. Click **"Enable Messaging API"** (Messaging APIを利用する)
2. Select or create a **Provider** (e.g., "SLA Project" or your name)
3. Confirm and enable

### 2.4 Note Your Channel Info

After enabling, you'll see:
- **Channel ID**
- **Channel Secret** ← Copy this!
- Link to LINE Developers Console

---

## Step 3: Get Your Credentials (3 minutes)

### 3.1 Go to LINE Developers Console

Go to: https://developers.line.biz/console/

### 3.2 Select Your Channel

1. Click on your Provider
2. Click on your Channel (the one you just created)

### 3.3 Get Channel Secret

1. Click the **"Basic settings"** tab
2. Find **"Channel secret"**
3. **Copy it** and save it somewhere

```
Example format: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

### 3.4 Get Channel Access Token

1. Click the **"Messaging API"** tab
2. Scroll down to **"Channel access token (long-lived)"**
3. Click **"Issue"** button
4. **Copy the long token** that appears

```
Example format: Very long string starting with something like "eyJhbGciOiJIUzI1..."
```

> **Important:** Keep these credentials secret! Don't share them publicly.

---

## Step 4: Disable Auto-Reply Messages (2 minutes)

By default, LINE Official Accounts have auto-reply messages. We need to turn this off.

### 4.1 Go to LINE Official Account Manager

Go to: https://manager.line.biz/

### 4.2 Disable Auto-Reply

1. Select your account
2. Go to **Settings** (設定) → **Response settings** (応答設定)
3. Find **"Auto-reply messages"** (自動応答メッセージ)
4. Turn it **OFF**

### 4.3 Disable Greeting Message (Optional)

1. In the same settings area
2. Find **"Greeting message"** (あいさつメッセージ)
3. Turn it **OFF** or customize it

---

## Step 5: Register Your Bot on Our Server (3 minutes)

### 5.1 Open Registration Page

Your instructor will provide the URL:
```
https://[server-address]/admin.html
```

### 5.2 Fill in the Registration Form

| Field | What to Enter |
|-------|---------------|
| **Your Name / Group Name** | Your name or group identifier |
| **Skill Type** | Select your bot's focus (Speaking/Listening/etc.) |
| **Channel Access Token** | Paste the long token from Step 3.4 |
| **Channel Secret** | Paste the secret from Step 3.3 |
| **System Prompt** | Paste your ENTIRE System Prompt from the SLA Chatbot Builder |
| **Admin Password** | Ask your instructor |

### 5.3 Submit

- Click **"Register My Bot"**
- If successful, you'll see your **Webhook URL**
- **Copy this Webhook URL** - you need it for the next step!

---

## Step 6: Set Webhook in LINE (2 minutes)

### 6.1 Go to LINE Developers Console

Go to: https://developers.line.biz/console/

### 6.2 Open Your Channel

1. Select your Provider
2. Select your Channel

### 6.3 Configure Webhook

1. Click the **"Messaging API"** tab
2. Scroll to **"Webhook settings"**
3. Click **"Edit"** next to Webhook URL
4. **Paste your Webhook URL** from Step 5.3
5. Click **"Update"**

### 6.4 Enable Webhook

1. Make sure **"Use webhook"** is turned **ON**
2. Click **"Verify"** to test the connection
3. You should see **"Success"** message

---

## Step 7: Test Your Bot! (1 minute)

### 7.1 Add Your Bot as Friend

**Option A: QR Code**
1. In LINE Developers Console → Messaging API tab
2. Find the **QR code** at the top
3. Scan it with your LINE app

**Option B: Search by ID**
1. Find your **Bot basic ID** (starts with @)
2. In LINE app, search for this ID and add as friend

### 7.2 Send a Test Message

Open a chat with your bot and type:
```
Hello! I want to practice my English speaking skills.
```

Your bot should respond with strategy guidance based on your System Prompt!

---

## Bot Commands

Your bot supports these special commands:

| Command | What it Does |
|---------|--------------|
| `/help` | Shows help information |
| `/reset` | Clears conversation history and starts fresh |

---

## Troubleshooting

### Bot doesn't respond?

1. **Check webhook is enabled** in LINE Developers Console
2. **Click "Verify"** button next to webhook URL
3. **Check auto-reply is OFF** in Official Account Manager
4. **Wait a few seconds** - sometimes there's a small delay

### "Webhook verification failed"?

1. Check the server is running
2. Verify webhook URL is correct (https://)
3. Ask your instructor if the server is online

### Bot gives unexpected responses?

1. Check your System Prompt in the registration
2. You can update it by re-registering with the same name

### Can't find Messaging API option?

1. Make sure you created a LINE Official Account first
2. Go to Official Account Manager → Settings → Messaging API
3. Enable Messaging API there first

---

## Sharing Your Bot

### Get Your Bot's QR Code

1. Go to LINE Developers Console
2. Open your channel → Messaging API tab
3. Screenshot or download the QR code

### Share the Link

Your bot has a unique URL:
```
https://line.me/R/ti/p/@[your-bot-basic-id]
```

Find the Bot basic ID in the Messaging API tab.

---

## Summary: Quick Reference

```
┌─────────────────────────────────────────────────────────────┐
│                    LINE BOT SETUP FLOW                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Create LINE Official Account                            │
│     → https://www.linebiz.com/jp/entry/                     │
│                                                             │
│  2. Enable Messaging API                                    │
│     → Official Account Manager → Settings → Messaging API   │
│                                                             │
│  3. Get credentials from LINE Developers Console            │
│     → Channel Secret (Basic settings)                       │
│     → Channel Access Token (Messaging API → Issue)          │
│                                                             │
│  4. Disable auto-reply                                      │
│     → Official Account Manager → Response settings          │
│                                                             │
│  5. Register at our server                                  │
│     → https://[server]/admin.html                           │
│                                                             │
│  6. Set Webhook URL in LINE                                 │
│     → Developers Console → Messaging API → Webhook settings │
│                                                             │
│  7. Test: Add bot as friend → Send message                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Useful Links

| Resource | URL |
|----------|-----|
| LINE Official Account Creation | https://www.linebiz.com/jp/entry/ |
| LINE Official Account Manager | https://manager.line.biz/ |
| LINE Developers Console | https://developers.line.biz/console/ |
| Messaging API Documentation | https://developers.line.biz/en/docs/messaging-api/ |

---

## Need Help?

- Ask your instructor
- Check the troubleshooting section above
- Make sure all steps were completed in order

**Good luck with your LINE Bot! 🤖📱**
