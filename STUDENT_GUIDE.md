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

## Step 1: Create a LINE Developer Account (3 minutes)

### 1.1 Go to LINE Developer Console

Open your browser and go to:
```
https://developers.line.biz/console/
```

### 1.2 Log in with LINE

- Click "Log in with LINE account"
- Use your personal LINE account credentials
- Approve the permissions

### 1.3 Accept Terms

- Read and accept the developer agreement
- You only need to do this once

---

## Step 2: Create a Provider (2 minutes)

### 2.1 Create New Provider

- Click the **"Create"** button
- Enter a provider name:
  - Example: `John_SLA_Project` or `Speaking_Group_A`
- Click **"Create"**

> **What is a Provider?**
> A provider is like a folder that contains your bot channels. You can have multiple bots under one provider.

---

## Step 3: Create a Messaging API Channel (5 minutes)

### 3.1 Create Channel

- Click **"Create a Messaging API channel"**

### 3.2 Fill in Channel Information

| Field | What to Enter |
|-------|---------------|
| **Channel type** | Messaging API (already selected) |
| **Provider** | Select the one you just created |
| **Channel icon** | Optional - upload an image |
| **Channel name** | Your bot's name (e.g., "Speaking Strategy Coach") |
| **Channel description** | Brief description of your bot |
| **Category** | Select "Education" |
| **Subcategory** | Select "School" or "Language" |
| **Email address** | Your email |

### 3.3 Accept Terms and Create

- Check the boxes for LINE Official Account Terms
- Check the boxes for Messaging API Terms
- Click **"Create"**

---

## Step 4: Get Your Credentials (3 minutes)

You need TWO pieces of information:

### 4.1 Get Channel Secret

1. In your channel, click the **"Basic settings"** tab
2. Find **"Channel secret"**
3. Click to reveal and **copy it**
4. Save it somewhere (you'll need it soon)

```
Example format: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

### 4.2 Get Channel Access Token

1. Click the **"Messaging API"** tab
2. Scroll down to **"Channel access token"**
3. Click **"Issue"** button
4. **Copy the long token** that appears
5. Save it somewhere (you'll need it soon)

```
Example format: Very long string starting with something like "eyJhbGciOiJIUzI1..."
```

> **Important:** Keep these credentials secret! Don't share them publicly.

---

## Step 5: Disable Auto-Reply (1 minute)

By default, LINE bots have auto-reply messages. We need to turn this off.

1. In the **"Messaging API"** tab
2. Find **"Auto-reply messages"**
3. Click **"Edit"** (opens LINE Official Account Manager)
4. Turn **OFF** the auto-reply toggle
5. Close that tab and return to Developer Console

---

## Step 6: Register Your Bot on Our Server (3 minutes)

### 6.1 Open Registration Page

Your instructor will provide the URL. It looks like:
```
http://[server-address]/admin.html
```

### 6.2 Fill in the Registration Form

| Field | What to Enter |
|-------|---------------|
| **Your Name / Group Name** | Your name or group identifier |
| **Skill Type** | Select your bot's focus (Speaking/Listening/etc.) |
| **Channel Access Token** | Paste the long token from Step 4.2 |
| **Channel Secret** | Paste the secret from Step 4.1 |
| **System Prompt** | Paste your ENTIRE System Prompt from the SLA Chatbot Builder |
| **Admin Password** | Ask your instructor |

### 6.3 Submit

- Click **"Register My Bot"**
- If successful, you'll see your **Webhook URL**
- **Copy this Webhook URL** - you need it for the next step!

---

## Step 7: Set Webhook in LINE (2 minutes)

### 7.1 Go Back to LINE Developer Console

1. Open your channel in LINE Developer Console
2. Click the **"Messaging API"** tab

### 7.2 Configure Webhook

1. Scroll to **"Webhook settings"**
2. Click **"Edit"** next to Webhook URL
3. **Paste your Webhook URL** from Step 6.3
4. Click **"Update"**

### 7.3 Enable Webhook

1. Make sure **"Use webhook"** is turned **ON**
2. Click **"Verify"** to test the connection
3. You should see "Success" message

---

## Step 8: Test Your Bot! (1 minute)

### 8.1 Add Your Bot as Friend

1. In the **"Messaging API"** tab
2. Find the **QR code** at the top
3. Scan it with your LINE app
4. Add your bot as a friend

### 8.2 Send a Test Message

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

1. **Check webhook is enabled** in LINE Developer Console
2. **Verify webhook** - click the Verify button
3. **Check auto-reply is OFF**
4. **Wait a few seconds** - sometimes there's a delay

### "Webhook verification failed"?

1. Make sure the server is running
2. Check the Webhook URL is correct
3. Ask your instructor if the server is online

### Bot gives unexpected responses?

1. Check your System Prompt in the registration
2. You can update it by re-registering with the same name

---

## Sharing Your Bot

### Get Your Bot's QR Code

1. Go to LINE Developer Console
2. Open your channel → Messaging API tab
3. Screenshot or download the QR code

### Share the Link

Your bot has a unique URL:
```
https://line.me/R/ti/p/@[your-bot-id]
```

Find this in the Messaging API tab under "Bot basic ID"

---

## What's Next?

Now that your bot is live, you can:

1. **Test with classmates** - Have them scan your QR code
2. **Collect feedback** - Is your bot helping them learn?
3. **Iterate** - Update your System Prompt based on feedback
4. **Research** - This could be a research project on AI-assisted language learning!

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────┐
│                    YOUR LINE BOT SETUP                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. LINE Developer Console:                                 │
│     https://developers.line.biz/console/                    │
│                                                             │
│  2. Get from your channel:                                  │
│     • Channel Secret (Basic settings tab)                   │
│     • Channel Access Token (Messaging API tab → Issue)      │
│                                                             │
│  3. Register at:                                            │
│     http://[server]/admin.html                              │
│                                                             │
│  4. Set Webhook URL in LINE:                                │
│     Messaging API tab → Webhook settings                    │
│                                                             │
│  5. Test: Scan QR code → Add friend → Send message          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Need Help?

- Ask your instructor
- Check the troubleshooting section above
- Make sure all steps were completed in order

**Good luck with your LINE Bot! 🤖📱**
