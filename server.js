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
const FormData = require('form-data');

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

// Google Cloud TTS Configuration
const GOOGLE_TTS_API_KEY = process.env.GOOGLE_TTS_API_KEY;

// Temporary audio storage (in-memory)
const audioStorage = new Map();

// Store last bot response per user (for /listen command)
const lastBotResponse = new Map();

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
async function logConversation(botConfig, botId, userId, userMessage, botResponse, messageType = 'text') {
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
            'message_type': messageType,  // 'text' or 'audio'
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

// Download audio file from LINE
async function downloadAudioFromLine(messageId, channelAccessToken) {
    try {
        const response = await axios.get(
            `https://api-data.line.me/v2/bot/message/${messageId}/content`,
            {
                headers: {
                    'Authorization': `Bearer ${channelAccessToken}`
                },
                responseType: 'arraybuffer'
            }
        );
        return Buffer.from(response.data);
    } catch (error) {
        console.error('Error downloading audio from LINE:', error);
        throw error;
    }
}

// Transcribe audio using Groq Whisper
async function transcribeAudio(audioBuffer) {
    try {
        const formData = new FormData();
        formData.append('file', audioBuffer, {
            filename: 'audio.m4a',
            contentType: 'audio/m4a'
        });
        formData.append('model', 'whisper-large-v3');
        formData.append('language', 'en');  // Can be changed based on bot config

        const response = await axios.post(
            'https://api.groq.com/openai/v1/audio/transcriptions',
            formData,
            {
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    ...formData.getHeaders()
                }
            }
        );

        return response.data.text;
    } catch (error) {
        console.error('Whisper transcription error:', error.response?.data || error.message);
        throw error;
    }
}

// Get speaking feedback from AI - uses the same system prompt as text messages
async function getSpeakingFeedback(systemPrompt, transcribedText, userId, botId) {
    // Simply use the regular AI response function with the transcribed text
    // This ensures the student's system prompt is fully respected
    return await getAIResponse(systemPrompt, transcribedText, userId, botId);
}

// Text-to-Speech using Google Cloud TTS
async function textToSpeech(text, languageCode = 'en-US') {
    try {
        // Limit text length to avoid issues
        const truncatedText = text.substring(0, 5000);

        const response = await axios.post(
            `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`,
            {
                input: { text: truncatedText },
                voice: {
                    languageCode: languageCode,
                    name: 'en-US-Standard-C',  // Female voice - often clearer
                    ssmlGender: 'FEMALE'
                },
                audioConfig: {
                    audioEncoding: 'MP3',
                    effectsProfileId: ['small-bluetooth-speaker-class-device'],
                    speakingRate: 1.0,
                    pitch: 0,
                    volumeGainDb: 6.0  // Boost volume significantly
                }
            }
        );

        // Return base64 audio content
        return response.data.audioContent;
    } catch (error) {
        console.error('Google TTS Error:', error.response?.data || error.message);
        throw error;
    }
}

// Store audio and return ID
function storeAudio(audioBase64) {
    const audioId = `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const audioBuffer = Buffer.from(audioBase64, 'base64');

    // Store with expiration (clean up after 5 minutes)
    audioStorage.set(audioId, {
        buffer: audioBuffer,
        createdAt: Date.now()
    });

    // Clean up old audio files
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    for (const [id, data] of audioStorage.entries()) {
        if (data.createdAt < fiveMinutesAgo) {
            audioStorage.delete(id);
        }
    }

    return audioId;
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
// Audio Serving Endpoint
// ==========================================

// Support both /audio/:audioId and /audio/:audioId.mp3
app.get('/audio/:audioId', (req, res) => {
    // Remove .mp3 extension if present
    const audioId = req.params.audioId.replace(/\.mp3$/, '');
    const audioData = audioStorage.get(audioId);

    if (!audioData) {
        return res.status(404).json({ error: 'Audio not found or expired' });
    }

    res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioData.buffer.length,
        'Content-Disposition': 'inline; filename="audio.mp3"'
    });
    res.send(audioData.buffer);
});

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
                    `Welcome to ${botConfig.studentName}'s ${botConfig.skillType} Strategy Bot!\n\n📝 Text: Type your message to practice\n🎤 Voice: Send a voice message for speaking practice!\n🔊 /listen: Hear the last response as audio\n\nCommands:\n/reset - Clear conversation history\n/listen - Listen to the last response\n/help - Show this message\n\nJust type or speak naturally to practice ${botConfig.skillType.toLowerCase()} strategies!`,
                    botConfig.channelAccessToken
                );
                continue;
            }

            // Handle /listen command - TTS for last response
            if (userMessage.toLowerCase() === '/listen') {
                const responseKey = `${botId}_${userId}`;
                const lastResponse = lastBotResponse.get(responseKey);

                if (!lastResponse) {
                    await replyToLine(
                        replyToken,
                        "No previous response to listen to. Send me a message first!",
                        botConfig.channelAccessToken
                    );
                    continue;
                }

                try {
                    // Generate TTS audio
                    const audioBase64 = await textToSpeech(lastResponse);
                    const audioId = storeAudio(audioBase64);

                    // Get server URL with .mp3 extension
                    const host = process.env.RENDER_EXTERNAL_URL || `https://localhost:${PORT}`;
                    const audioUrl = `${host.replace(/\/$/, '')}/audio/${audioId}.mp3`;

                    // Send audio message using reply
                    await axios.post(
                        'https://api.line.me/v2/bot/message/reply',
                        {
                            replyToken: replyToken,
                            messages: [{
                                type: 'audio',
                                originalContentUrl: audioUrl,
                                duration: Math.min(lastResponse.length * 80, 60000)
                            }]
                        },
                        {
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${botConfig.channelAccessToken}`
                            }
                        }
                    );

                    console.log('Audio sent successfully');
                } catch (error) {
                    console.error('TTS Error:', error);
                    await replyToLine(
                        replyToken,
                        "Sorry, I couldn't generate the audio. Please try again.",
                        botConfig.channelAccessToken
                    );
                }
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

                // Check if user wants audio/voice practice
                const audioKeywords = [
                    '語音', '聽', '發音', '念', '唸', '讀給我聽', '說給我聽',
                    'audio', 'listen', 'voice', 'speak', 'pronunciation',
                    'hear', 'sound', 'say it', 'read it', 'listening practice'
                ];
                const wantsAudio = audioKeywords.some(keyword =>
                    userMessage.toLowerCase().includes(keyword.toLowerCase())
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

                // Store last response for /listen command
                const responseKey = `${botId}_${userId}`;
                lastBotResponse.set(responseKey, aiResponse);

                // Auto-send audio if user requested voice/listening practice
                if (wantsAudio && GOOGLE_TTS_API_KEY) {
                    try {
                        console.log('User requested audio, generating TTS...');

                        // Generate TTS audio
                        const audioBase64 = await textToSpeech(aiResponse);
                        const audioId = storeAudio(audioBase64);

                        // Get server URL with .mp3 extension
                        const host = process.env.RENDER_EXTERNAL_URL || `https://localhost:${PORT}`;
                        const audioUrl = `${host.replace(/\/$/, '')}/audio/${audioId}.mp3`;

                        // Send audio message
                        await axios.post(
                            'https://api.line.me/v2/bot/message/push',
                            {
                                to: userId,
                                messages: [{
                                    type: 'audio',
                                    originalContentUrl: audioUrl,
                                    duration: Math.min(aiResponse.length * 80, 60000)  // Estimate duration
                                }]
                            },
                            {
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${botConfig.channelAccessToken}`
                                }
                            }
                        );
                        console.log('Auto audio sent successfully');
                    } catch (audioError) {
                        console.error('Auto TTS Error:', audioError);
                        // Don't fail the whole response if TTS fails
                    }
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

        // Handle audio messages (voice messages for speaking practice)
        if (event.type === 'message' && event.message.type === 'audio') {
            const messageId = event.message.id;
            const userId = event.source.userId;
            const replyToken = event.replyToken;

            console.log(`User ${userId} sent audio message: ${messageId}`);

            try {
                // Download audio from LINE
                const audioBuffer = await downloadAudioFromLine(messageId, botConfig.channelAccessToken);
                console.log(`Audio downloaded: ${audioBuffer.length} bytes`);

                // Step 2: Transcribe using Whisper
                const transcribedText = await transcribeAudio(audioBuffer);
                console.log(`Transcribed: ${transcribedText}`);

                // Get AI feedback
                const feedback = await getSpeakingFeedback(
                    botConfig.systemPrompt,
                    transcribedText,
                    userId,
                    botId
                );

                // Send feedback using reply token
                await replyToLine(
                    replyToken,
                    `📝 I heard you say:\n"${transcribedText}"\n\n${feedback}`,
                    botConfig.channelAccessToken
                );

                // Log to DynamoDB
                await logConversation(
                    botConfig,
                    botId,
                    userId,
                    `[Voice Message] ${transcribedText}`,
                    feedback,
                    'audio'
                );

                console.log('Speaking feedback sent successfully');

            } catch (error) {
                console.error('Audio processing error:', error);
                // Try to send error message via push
                try {
                    await axios.post(
                        'https://api.line.me/v2/bot/message/push',
                        {
                            to: userId,
                            messages: [{
                                type: 'text',
                                text: "Sorry, I had trouble processing your voice message. Please try again or type your message instead."
                            }]
                        },
                        {
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${botConfig.channelAccessToken}`
                            }
                        }
                    );
                } catch (pushError) {
                    console.error('Push message error:', pushError);
                }
            }
        }

        // Handle follow event (when user adds the bot)
        if (event.type === 'follow') {
            const replyToken = event.replyToken;
            await replyToLine(
                replyToken,
                `Welcome! I'm ${botConfig.studentName}'s ${botConfig.skillType} Strategy Coach.\n\nI'm here to help you learn ${botConfig.skillType.toLowerCase()} strategies based on SLA theory.\n\n📝 Type a message to practice\n🎤 Send a voice message for speaking practice!\n\nType /help for more options.`,
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
