// ==========================================
// SLA Strategy LINE Bot Server
// Multi-tenant server supporting multiple student bots
// ==========================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Groq API Configuration
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

// Store conversation history per user (in memory - resets on server restart)
const conversationHistory = {};

// Bot configuration file path
const BOTS_CONFIG_PATH = path.join(__dirname, 'config', 'bots.json');
const CONFIG_DIR = path.join(__dirname, 'config');

// Ensure config directory and file exist
function ensureConfigExists() {
    try {
        // Create config directory if it doesn't exist
        if (!fs.existsSync(CONFIG_DIR)) {
            fs.mkdirSync(CONFIG_DIR, { recursive: true });
            console.log('Created config directory');
        }
        // Create bots.json if it doesn't exist
        if (!fs.existsSync(BOTS_CONFIG_PATH)) {
            fs.writeFileSync(BOTS_CONFIG_PATH, JSON.stringify({ bots: {} }, null, 2));
            console.log('Created bots.json file');
        }
    } catch (error) {
        console.error('Error ensuring config exists:', error);
    }
}

// Initialize config on startup
ensureConfigExists();

// ==========================================
// Middleware
// ==========================================

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Parse JSON for admin routes
app.use('/admin', express.json());
app.use('/api', express.json());

// ==========================================
// Helper Functions
// ==========================================

// Load bot configurations
function loadBotConfigs() {
    try {
        const data = fs.readFileSync(BOTS_CONFIG_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading bot configs:', error);
        return { bots: {} };
    }
}

// Save bot configurations
function saveBotConfigs(configs) {
    try {
        fs.writeFileSync(BOTS_CONFIG_PATH, JSON.stringify(configs, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving bot configs:', error);
        return false;
    }
}

// Get bot config by channel ID or channel secret
function getBotConfig(channelId) {
    const configs = loadBotConfigs();
    return configs.bots[channelId] || null;
}

// Verify LINE signature
function verifySignature(body, signature, channelSecret) {
    const hash = crypto
        .createHmac('SHA256', channelSecret)
        .update(Buffer.from(JSON.stringify(body)))
        .digest('base64');
    return hash === signature;
}

// Send reply to LINE
async function replyToLine(replyToken, messages, channelAccessToken) {
    try {
        await axios.post(
            'https://api.line.me/v2/bot/message/reply',
            {
                replyToken: replyToken,
                messages: Array.isArray(messages) ? messages : [{ type: 'text', text: messages }]
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${channelAccessToken}`
                }
            }
        );
        return true;
    } catch (error) {
        console.error('LINE Reply Error:', error.response?.data || error.message);
        return false;
    }
}

// Get AI response from Groq
async function getAIResponse(systemPrompt, userMessage, userId, botId) {
    // Initialize conversation history for this user
    const historyKey = `${botId}_${userId}`;
    if (!conversationHistory[historyKey]) {
        conversationHistory[historyKey] = [];
    }

    // Add user message to history
    conversationHistory[historyKey].push({
        role: 'user',
        content: userMessage
    });

    // Keep only last 10 exchanges (20 messages) to avoid token limits
    if (conversationHistory[historyKey].length > 20) {
        conversationHistory[historyKey] = conversationHistory[historyKey].slice(-20);
    }

    try {
        const response = await axios.post(
            GROQ_API_URL,
            {
                model: MODEL,
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...conversationHistory[historyKey]
                ],
                temperature: 0.7,
                max_tokens: 500
            },
            {
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const assistantMessage = response.data.choices[0].message.content;

        // Add assistant response to history
        conversationHistory[historyKey].push({
            role: 'assistant',
            content: assistantMessage
        });

        return assistantMessage;

    } catch (error) {
        console.error('Groq API Error:', error.response?.data || error.message);
        throw error;
    }
}

// ==========================================
// LINE Webhook Endpoint (handles all bots)
// ==========================================

// GET endpoint for browser access and verification
app.get('/webhook/:botId', (req, res) => {
    const botId = req.params.botId;
    const botConfig = getBotConfig(botId);

    if (botConfig) {
        res.json({
            status: 'OK',
            message: `Webhook endpoint for ${botConfig.studentName}'s ${botConfig.skillType} Bot is active`,
            botId: botId,
            note: 'This endpoint receives POST requests from LINE. Use LINE app to chat with the bot.'
        });
    } else {
        res.status(404).json({
            error: 'Bot not found',
            botId: botId
        });
    }
});

// Raw body parser for LINE webhook signature verification
app.post('/webhook/:botId', express.raw({ type: 'application/json' }), async (req, res) => {
    const botId = req.params.botId;
    const signature = req.headers['x-line-signature'];

    console.log(`\n[${new Date().toISOString()}] Webhook received for bot: ${botId}`);

    // Get bot configuration
    const botConfig = getBotConfig(botId);
    if (!botConfig) {
        console.error(`Bot not found: ${botId}`);
        return res.status(404).json({ error: 'Bot not found' });
    }

    // Parse body
    let body;
    try {
        body = JSON.parse(req.body.toString());
    } catch (error) {
        console.error('Failed to parse body:', error);
        return res.status(400).json({ error: 'Invalid JSON' });
    }

    // Verify signature
    if (!verifySignature(body, signature, botConfig.channelSecret)) {
        console.error('Invalid signature');
        return res.status(401).json({ error: 'Invalid signature' });
    }

    // Process events
    const events = body.events || [];

    for (const event of events) {
        if (event.type === 'message' && event.message.type === 'text') {
            const userMessage = event.message.text;
            const userId = event.source.userId;
            const replyToken = event.replyToken;

            console.log(`User ${userId}: ${userMessage}`);

            // Handle special commands
            if (userMessage.toLowerCase() === '/reset') {
                const historyKey = `${botId}_${userId}`;
                conversationHistory[historyKey] = [];
                await replyToLine(
                    replyToken,
                    "Conversation reset! Let's start fresh. How can I help you practice today?",
                    botConfig.channelAccessToken
                );
                continue;
            }

            if (userMessage.toLowerCase() === '/help') {
                await replyToLine(
                    replyToken,
                    `Welcome to ${botConfig.studentName}'s ${botConfig.skillType} Strategy Bot!\n\nCommands:\n/reset - Clear conversation history\n/help - Show this message\n\nJust type naturally to practice ${botConfig.skillType.toLowerCase()} strategies!`,
                    botConfig.channelAccessToken
                );
                continue;
            }

            try {
                // Get AI response
                const aiResponse = await getAIResponse(
                    botConfig.systemPrompt,
                    userMessage,
                    userId,
                    botId
                );

                // Split long messages (LINE has 5000 char limit)
                const maxLength = 4500;
                if (aiResponse.length > maxLength) {
                    const messages = [];
                    for (let i = 0; i < aiResponse.length; i += maxLength) {
                        messages.push({
                            type: 'text',
                            text: aiResponse.substring(i, i + maxLength)
                        });
                    }
                    await replyToLine(replyToken, messages, botConfig.channelAccessToken);
                } else {
                    await replyToLine(replyToken, aiResponse, botConfig.channelAccessToken);
                }

                console.log(`Bot response sent successfully`);

            } catch (error) {
                console.error('AI Response Error:', error);
                await replyToLine(
                    replyToken,
                    "Sorry, I'm having trouble right now. Please try again in a moment.",
                    botConfig.channelAccessToken
                );
            }
        }

        // Handle follow event (when user adds the bot)
        if (event.type === 'follow') {
            const replyToken = event.replyToken;
            await replyToLine(
                replyToken,
                `Welcome! I'm ${botConfig.studentName}'s ${botConfig.skillType} Strategy Coach.\n\nI'm here to help you learn ${botConfig.skillType.toLowerCase()} strategies based on SLA theory.\n\nType /help to see available commands, or just start chatting!`,
                botConfig.channelAccessToken
            );
        }
    }

    res.status(200).json({ success: true });
});

// ==========================================
// Admin API Endpoints
// ==========================================

// Health check
app.get('/api/health', (req, res) => {
    const configs = loadBotConfigs();
    res.json({
        status: 'OK',
        message: 'SLA LINE Bot Server is running',
        registeredBots: Object.keys(configs.bots).length,
        timestamp: new Date().toISOString()
    });
});

// List all registered bots (names only, no secrets)
app.get('/api/bots', (req, res) => {
    const configs = loadBotConfigs();
    const botList = Object.entries(configs.bots).map(([id, bot]) => ({
        id: id,
        studentName: bot.studentName,
        skillType: bot.skillType,
        createdAt: bot.createdAt
    }));
    res.json({ success: true, bots: botList });
});

// Register a new bot
app.post('/api/register', (req, res) => {
    const {
        studentName,
        skillType,
        channelAccessToken,
        channelSecret,
        systemPrompt
    } = req.body;

    // Validate required fields
    if (!studentName || !skillType || !channelAccessToken || !channelSecret || !systemPrompt) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    // Generate bot ID from student name
    const botId = studentName.toLowerCase().replace(/[^a-z0-9]/g, '_');

    // Load current configs
    const configs = loadBotConfigs();

    // Check if bot already exists
    if (configs.bots[botId]) {
        return res.status(409).json({
            error: 'Bot with this name already exists',
            existingBotId: botId
        });
    }

    // Add new bot
    configs.bots[botId] = {
        studentName,
        skillType,
        channelAccessToken,
        channelSecret,
        systemPrompt,
        createdAt: new Date().toISOString()
    };

    // Save configs
    if (saveBotConfigs(configs)) {
        // Use https in production (Render uses reverse proxy)
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.get('host');
        const webhookUrl = `https://${host}/webhook/${botId}`;
        res.json({
            success: true,
            message: 'Bot registered successfully!',
            botId: botId,
            webhookUrl: webhookUrl
        });
    } else {
        res.status(500).json({ error: 'Failed to save bot configuration' });
    }
});

// Update existing bot
app.put('/api/bots/:botId', (req, res) => {
    const { botId } = req.params;
    const { systemPrompt, adminPassword } = req.body;

    // Validate admin password
    if (adminPassword !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Invalid admin password' });
    }

    // Load configs
    const configs = loadBotConfigs();

    if (!configs.bots[botId]) {
        return res.status(404).json({ error: 'Bot not found' });
    }

    // Update system prompt
    if (systemPrompt) {
        configs.bots[botId].systemPrompt = systemPrompt;
        configs.bots[botId].updatedAt = new Date().toISOString();
    }

    if (saveBotConfigs(configs)) {
        res.json({ success: true, message: 'Bot updated successfully' });
    } else {
        res.status(500).json({ error: 'Failed to update bot configuration' });
    }
});

// Delete bot
app.delete('/api/bots/:botId', (req, res) => {
    const { botId } = req.params;
    const { adminPassword } = req.body;

    // Validate admin password
    if (adminPassword !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Invalid admin password' });
    }

    // Load configs
    const configs = loadBotConfigs();

    if (!configs.bots[botId]) {
        return res.status(404).json({ error: 'Bot not found' });
    }

    delete configs.bots[botId];

    if (saveBotConfigs(configs)) {
        res.json({ success: true, message: 'Bot deleted successfully' });
    } else {
        res.status(500).json({ error: 'Failed to delete bot' });
    }
});

// ==========================================
// Start Server
// ==========================================

app.listen(PORT, () => {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                                                            ║');
    console.log('║         🤖 SLA Strategy LINE Bot Server                   ║');
    console.log('║         Multi-tenant Edition                               ║');
    console.log('║                                                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log(`✅ Server running at: http://localhost:${PORT}`);
    console.log(`✅ Admin interface: http://localhost:${PORT}/admin.html`);
    console.log(`✅ Groq API Key: ${GROQ_API_KEY ? GROQ_API_KEY.substring(0, 15) + '...' : 'NOT SET!'}`);

    const configs = loadBotConfigs();
    console.log(`✅ Registered bots: ${Object.keys(configs.bots).length}`);

    console.log('\n📊 Endpoints:');
    console.log(`   POST /webhook/:botId  - LINE webhook for each bot`);
    console.log(`   GET  /api/health      - Health check`);
    console.log(`   GET  /api/bots        - List registered bots`);
    console.log(`   POST /api/register    - Register new bot`);
    console.log(`   PUT  /api/bots/:id    - Update bot prompt`);
    console.log(`   DEL  /api/bots/:id    - Delete bot`);
    console.log('');
});
