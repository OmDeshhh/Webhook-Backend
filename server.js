const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const webhooks = new Map();

function generateWebhookId() {
  return crypto.randomBytes(16).toString('hex');
}

app.post('/api/webhooks/create', (req, res) => {
  const webhookId = generateWebhookId();
  const webhookUrl = `${req.protocol}://${req.get('host')}/webhook/${webhookId}`;
  
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
    uptime: process.uptime()
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Webhook server running on http://localhost:${PORT}`);
  console.log(`📡 Ready to receive webhooks`);
});