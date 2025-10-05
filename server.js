require('dotenv').config();

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const ngrok = require('@ngrok/ngrok');

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json());

const webhooks = new Map();
let publicUrl = null;

function generateWebhookId() {
  return crypto.randomBytes(16).toString('hex');
}

function createStartupWebhook(baseUrl) {
  const webhookId = generateWebhookId();
  const webhookUrl = `${baseUrl}/webhook/${webhookId}`;

  webhooks.set(webhookId, {
    id: webhookId,
    url: webhookUrl,
    createdAt: new Date().toISOString(),
    requests: []
  });

  console.log(`✅ [Startup] Created webhook: ${webhookUrl}`);
  return webhookId;
}

app.post('/api/webhooks/create', (req, res) => {
  const webhookId = generateWebhookId();
  const baseUrl = publicUrl || `${req.protocol}://${req.get('host')}`;

  if (!publicUrl) {
    console.warn("⚠️  publicUrl not yet initialized — falling back to localhost");
  }

  const webhookUrl = `${baseUrl}/webhook/${webhookId}`;

  webhooks.set(webhookId, {
    id: webhookId,
    url: webhookUrl,
    createdAt: new Date().toISOString(),
    requests: []
  });

  console.log(`✅ Created webhook: ${webhookUrl}`);

  res.json({
    webhookId,
    webhookUrl,
    createdAt: webhooks.get(webhookId).createdAt
  });
});

app.all('/webhook/:id', (req, res) => {
  const { id } = req.params;

  if (!webhooks.has(id)) {
    return res.status(404).json({ error: 'Webhook not found' });
  }

  const webhookData = webhooks.get(id);
  const requestData = {
    timestamp: new Date().toISOString(),
    method: req.method,
    headers: req.headers,
    body: req.body,
    query: req.query,
    ip: req.ip || req.connection.remoteAddress
  };

  webhookData.requests.push(requestData);
  console.log(`📨 Received ${req.method} request to webhook ${id}`);

  res.status(200).json({
    message: 'Webhook received successfully',
    webhookId: id
  });
});

app.get('/api/webhooks/:id', (req, res) => {
  const { id } = req.params;

  if (!webhooks.has(id)) {
    return res.status(404).json({ error: 'Webhook not found' });
  }

  res.json(webhooks.get(id));
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    activeWebhooks: webhooks.size,
    uptime: process.uptime(),
    publicUrl: publicUrl || 'Not exposed',
    isLive: !!publicUrl
  });
});

app.get('/api/public-url', (req, res) => {
  res.json({
    publicUrl: publicUrl,
    isLive: !!publicUrl,
    localUrl: `http://localhost:${PORT}`
  });
});

async function startServer() {
  app.listen(PORT, async () => {
    console.log(`🚀 Webhook server running on http://localhost:${PORT}`);
    console.log(`📡 Ready to receive webhooks\n`);

    try {
      console.log('🌐 Creating tunnel to expose server to internet...');
      console.log('⏳ Please wait...\n');

      const listener = await ngrok.forward({
        addr: PORT,
        authtoken: process.env.NGROK_AUTH_TOKEN,
      });

      publicUrl = listener.url();

      console.log('═══════════════════════════════════════════════');
      console.log('🎉 SUCCESS! Server is LIVE on the internet! 🎉');
      console.log('═══════════════════════════════════════════════\n');
      console.log('📡 Public URL:', publicUrl);
      console.log('🔗 Local URL:  http://localhost:' + PORT + '\n');
      console.log('✅ All webhook URLs will automatically use public URL\n');

      const startupWebhookId = createStartupWebhook(publicUrl);

      console.log('\n🔥 Ready to receive webhooks from anywhere!');
      console.log('═══════════════════════════════════════════════');

    } catch (error) {
      console.log('⚠️  Could not create automatic tunnel');
      console.log('💡 Reason:', error.message, '\n');
      console.log('📝 To enable automatic tunneling:');
      console.log('   1. Make sure .env file exists in backend folder');
      console.log('   2. Add: NGROK_AUTH_TOKEN=your_token_here');
      console.log('   3. Get token from: https://dashboard.ngrok.com/get-started/your-authtoken\n');

      console.log('🔗 Server running locally on http://localhost:' + PORT);

      createStartupWebhook(`http://localhost:${PORT}`);
    }
  });
}
process.on('SIGINT', async () => {
  console.log('\n🛑 Gracefully shutting down...');
  if (publicUrl) {
    await ngrok.kill();
    console.log('🧹 ngrok tunnel closed.');
  }
  process.exit(0);
});

startServer();
