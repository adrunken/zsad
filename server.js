const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-70b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const SITE_DIR = path.join(__dirname, 'site');
const HISTORY_DIR = path.join(SITE_DIR, '.history');

const FILES = {
  'live.html': path.join(SITE_DIR, 'live.html'),
  'main.js': path.join(SITE_DIR, 'main.js'),
  'styles.css': path.join(SITE_DIR, 'styles.css')
};

let LAST_CALL = 0;
const MIN_SECONDS = 5;

const SYSTEM_PROMPT = `You are an expert web engineer modifying an existing website.
Preserve unrelated functionality and existing code.
Return JSON with keys: files (object mapping filename to full new content).
Do not explain. No markdown. Only JSON.`;

// Ensure history directory exists
if (!fs.existsSync(HISTORY_DIR)) {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

// Serve static files
app.use(express.static('client'));
app.use('/site', express.static('site'));

// Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'index.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Generate endpoint
app.post('/generate', async (req, res) => {
  try {
    const now = Date.now() / 1000;
    if (now - LAST_CALL < MIN_SECONDS) {
      return res.status(429).json({ error: 'Rate limit: wait a few seconds' });
    }
    LAST_CALL = now;

    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Missing prompt' });
    }

    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: 'GROQ_API_KEY not configured' });
    }

    console.log('Sending prompt to Groq:', prompt);

    // Read current files
    const currentFiles = {};
    for (const [name, filePath] of Object.entries(FILES)) {
      try {
        currentFiles[name] = fs.readFileSync(filePath, 'utf-8');
      } catch (e) {
        console.error(`Error reading ${name}:`, e.message);
        currentFiles[name] = '';
      }
    }

    // Call Groq API
    const groqResponse = await axios.post(
      GROQ_URL,
      {
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: 'CURRENT FILES:\n' + JSON.stringify(currentFiles) },
          { role: 'user', content: 'REQUEST:\n' + prompt }
        ],
        temperature: 0.2
      },
      {
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    console.log('Groq response status:', groqResponse.status);

    const content = groqResponse.data.choices[0].message.content;
    console.log('Groq raw content:', content);

    let result;
    try {
      // Handle markdown-wrapped JSON (```json ... ```)
      let jsonStr = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      result = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('JSON parse error:', parseError.message);
      return res.status(400).json({ error: `Failed to parse AI response: ${parseError.message}` });
    }

    if (!result.files || typeof result.files !== 'object') {
      console.error('Missing files key in response:', result);
      return res.status(400).json({ error: 'AI response missing "files" object. Got: ' + JSON.stringify(result).slice(0, 200) });
    }

    // Write preview files
    for (const [filename, content] of Object.entries(result.files)) {
      if (filename in FILES) {
        const previewPath = FILES[filename].replace(/\.\w+$/, `.preview.$&`);
        fs.writeFileSync(previewPath, content, 'utf-8');
        console.log(`Preview written: ${previewPath}`);
      }
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Generate error:', error.message);
    if (error.response?.status) {
      return res.status(error.response.status).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// Publish endpoint
app.post('/publish', async (req, res) => {
  try {
    // Create snapshot
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const snapshotDir = path.join(HISTORY_DIR, timestamp);
    
    if (!fs.existsSync(snapshotDir)) {
      fs.mkdirSync(snapshotDir, { recursive: true });
    }

    // Copy files to snapshot
    for (const [name, filePath] of Object.entries(FILES)) {
      fs.copyFileSync(filePath, path.join(snapshotDir, name));
    }

    console.log(`Snapshot created: ${timestamp}`);

    // Apply previews as actual files
    for (const [filename, filePath] of Object.entries(FILES)) {
      const previewPath = filePath.replace(/\.\w+$/, `.preview.$&`);
      if (fs.existsSync(previewPath)) {
        const content = fs.readFileSync(previewPath, 'utf-8');
        fs.writeFileSync(filePath, content, 'utf-8');
        fs.unlinkSync(previewPath);
        console.log(`Published: ${filename}`);
      }
    }

    res.json({ ok: true, version: timestamp });
  } catch (error) {
    console.error('Publish error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// History endpoint
app.get('/history', (req, res) => {
  try {
    const versions = fs.readdirSync(HISTORY_DIR)
      .filter(name => fs.statSync(path.join(HISTORY_DIR, name)).isDirectory())
      .sort((a, b) => parseInt(b) - parseInt(a));
    res.json(versions);
  } catch (error) {
    console.error('History error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Rollback endpoint
app.post('/rollback', (req, res) => {
  try {
    const { version } = req.body;
    if (!version) {
      return res.status(400).json({ error: 'Missing version' });
    }

    const snapshotDir = path.join(HISTORY_DIR, version);
    if (!fs.existsSync(snapshotDir)) {
      return res.status(404).json({ error: 'Version not found' });
    }

    // Restore files from snapshot
    for (const filename of fs.readdirSync(snapshotDir)) {
      const source = path.join(snapshotDir, filename);
      const dest = path.join(SITE_DIR, filename);
      fs.copyFileSync(source, dest);
    }

    console.log(`Restored version: ${version}`);
    res.json({ ok: true });
  } catch (error) {
    console.error('Rollback error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Self-Evolving Website running on port ${PORT}`);
  console.log(`📝 AI Editor: http://localhost:${PORT}`);
  console.log(`🌐 Live site: http://localhost:${PORT}/site/live.html`);
});
