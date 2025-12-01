// ==========================================
// SLA Strategy LINE Bot Server
// Multi-tenant server supporting multiple student bots
// ==========================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
const { Pool } = require('pg');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const app = express();
const PORT = process.env.PORT || 3001;

// Groq API Configuration
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

// Store conversation history per user (in memory - resets on server restart)
const conversationHistory = {};

// PostgreSQL Connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// AWS DynamoDB Configuration for conversation logging
const dynamoClient = new DynamoDBClient({
    region: process.env.AWS_REGION || 'ap-southeast-2',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE || 'Linebot';

// Initialize database table
async function initDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS bots (
                id VARCHAR(255) PRIMARY KEY,
                student_name VARCHAR(255) NOT NULL,
                skill_type VARCHAR(100) NOT NULL,
                channel_access_token TEXT NOT NULL,
                channel_secret VARCHAR(255) NOT NULL,
                system_prompt TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Database initialization error:', error);
    }
}

// Initialize database on startup
initDatabase();

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

// Get bot config by bot ID
async function getBotConfig(botId) {
    try {
        const result = await pool.query('SELECT * FROM bots WHERE id = $1', [botId]);
        if (result.rows.length === 0) return null;
        const bot = result.rows[0];
        return {
            studentName: bot.student_name,
            skillType: bot.skill_type,
            channelAccessToken: bot.channel_access_token,
            channelSecret: bot.channel_secret,
            systemPrompt: bot.system_prompt,
            createdAt: bot.created_at
        };
    } catch (error) {
        console.error('Error getting bot config:', error);
        return null;
    }
}

// Get all bots (for listing)
async function getAllBots() {
    try {
        const result = await pool.query('SELECT id, student_name, skill_type, created_at FROM bots ORDER BY created_at DESC');
        return result.rows.map(bot => ({
            id: bot.id,
            studentName: bot.student_name,
            skillType: bot.skill_type,
            createdAt: bot.created_at
        }));
    } catch (error) {
        console.error('Error getting all bots:', error);
        return [];
    }
}

// Log conversation to DynamoDB
async function logConversation(botConfig, botId, userId, userMessage, botResponse) {
    try {
        const timestamp = new Date().toISOString();
        const conversationId = `${botId}_${userId}_${Date.now()}`;

        const item = {
            'SLA Linebot': conversationId,  // Partition key
            'timestamp': timestamp,
            'bot_id': botId,
            'student_name': botConfig.studentName,
            'skill_type': botConfig.skillType,
            'system_prompt': botConfig.systemPrompt,
            'line_user_id': userId,
            'user_input': userMessage,
            'bot_output': botResponse,
            'created_at': timestamp
        };

        await docClient.send(new PutCommand({
            TableName: DYNAMODB_TABLE,
            Item: item
        }));

        console.log(`Conversation logged to DynamoDB: ${conversationId}`);
    } catch (error) {
        console.error('DynamoDB logging error:', error);
        // Don't throw - logging failure shouldn't break the chat
    }
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
app.get('/webhook/:botId', async (req, res) => {
    const botId = req.params.botId;
    const botConfig = await getBotConfig(botId);

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
    const botConfig = await getBotConfig(botId);
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

                // Log conversation to DynamoDB
                await logConversation(botConfig, botId, userId, userMessage, aiResponse);

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
app.get('/api/health', async (req, res) => {
    try {
        const result = await pool.query('SELECT COUNT(*) FROM bots');
        res.json({
            status: 'OK',
            message: 'SLA LINE Bot Server is running',
            registeredBots: parseInt(result.rows[0].count),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.json({
            status: 'OK',
            message: 'SLA LINE Bot Server is running (DB connecting...)',
            registeredBots: 0,
            timestamp: new Date().toISOString()
        });
    }
});

// List all registered bots (names only, no secrets)
app.get('/api/bots', async (req, res) => {
    const bots = await getAllBots();
    res.json({ success: true, bots: bots });
});

// Register a new bot
app.post('/api/register', async (req, res) => {
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

    try {
        // Check if bot already exists
        const existing = await pool.query('SELECT id FROM bots WHERE id = $1', [botId]);
        if (existing.rows.length > 0) {
            return res.status(409).json({
                error: 'Bot with this name already exists',
                existingBotId: botId
            });
        }

        // Insert new bot
        await pool.query(
            `INSERT INTO bots (id, student_name, skill_type, channel_access_token, channel_secret, system_prompt)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [botId, studentName, skillType, channelAccessToken, channelSecret, systemPrompt]
        );

        // Use https in production (Render uses reverse proxy)
        const host = req.get('host');
        const webhookUrl = `https://${host}/webhook/${botId}`;
        res.json({
            success: true,
            message: 'Bot registered successfully!',
            botId: botId,
            webhookUrl: webhookUrl
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Failed to save bot configuration' });
    }
});

// Update existing bot
app.put('/api/bots/:botId', async (req, res) => {
    const { botId } = req.params;
    const { systemPrompt } = req.body;

    try {
        // Check if bot exists
        const existing = await pool.query('SELECT id FROM bots WHERE id = $1', [botId]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Bot not found' });
        }

        // Update system prompt
        if (systemPrompt) {
            await pool.query(
                'UPDATE bots SET system_prompt = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                [systemPrompt, botId]
            );
        }

        res.json({ success: true, message: 'Bot updated successfully' });
    } catch (error) {
        console.error('Update error:', error);
        res.status(500).json({ error: 'Failed to update bot configuration' });
    }
});

// Delete bot
app.delete('/api/bots/:botId', async (req, res) => {
    const { botId } = req.params;

    try {
        const result = await pool.query('DELETE FROM bots WHERE id = $1 RETURNING id', [botId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Bot not found' });
        }

        res.json({ success: true, message: 'Bot deleted successfully' });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: 'Failed to delete bot' });
    }
});

// ==========================================
// Start Server
// ==========================================

app.listen(PORT, async () => {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                                                            ║');
    console.log('║         🤖 SLA Strategy LINE Bot Server                   ║');
    console.log('║         Multi-tenant Edition (PostgreSQL)                  ║');
    console.log('║                                                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log(`✅ Server running at: http://localhost:${PORT}`);
    console.log(`✅ Admin interface: http://localhost:${PORT}/admin.html`);
    console.log(`✅ Groq API Key: ${GROQ_API_KEY ? GROQ_API_KEY.substring(0, 15) + '...' : 'NOT SET!'}`);
    console.log(`✅ Database: PostgreSQL connected`);
    console.log(`✅ DynamoDB: ${process.env.AWS_ACCESS_KEY_ID ? 'Configured (ap-southeast-2)' : 'NOT CONFIGURED'}`);

    try {
        const result = await pool.query('SELECT COUNT(*) FROM bots');
        console.log(`✅ Registered bots: ${result.rows[0].count}`);
    } catch (error) {
        console.log(`⏳ Database connecting...`);
    }

    console.log('\n📊 Endpoints:');
    console.log(`   POST /webhook/:botId  - LINE webhook for each bot`);
    console.log(`   GET  /api/health      - Health check`);
    console.log(`   GET  /api/bots        - List registered bots`);
    console.log(`   POST /api/register    - Register new bot`);
    console.log(`   PUT  /api/bots/:id    - Update bot prompt`);
    console.log(`   DEL  /api/bots/:id    - Delete bot`);
    console.log('');
});
