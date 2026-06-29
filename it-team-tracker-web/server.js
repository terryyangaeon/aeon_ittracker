// Minimal static file server for IT Team Tracker frontend
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from /public
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  setHeaders(res, filePath) {
    // HTML should not be cached aggressively so updates propagate
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// SPA fallback — serve index.html for any route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`IT Team Tracker web running on port ${PORT}`);
});
