const { Router } = require('express');
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = Router();

// ==================== SMART DEFAULTS ====================
router.get('/defaults', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT unnest(sites) AS site, COUNT(*) AS cnt
       FROM work_entries
       WHERE user_id = $1 AND event_type = 'Daily'
         AND date >= CURRENT_DATE - INTERVAL '60 days'
         AND array_length(sites, 1) > 0
       GROUP BY site ORDER BY cnt DESC LIMIT 5`,
      [req.user.id]
    );
    res.json({ frequentSites: rows.map(r => r.site) });
  } catch (err) {
    console.error('GET /suggestions/defaults error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== DESCRIPTION AUTOCOMPLETE ====================
router.get('/descriptions', authMiddleware, async (req, res) => {
  try {
    const { q } = req.query;
    let query = `SELECT DISTINCT description FROM work_entries
       WHERE user_id = $1 AND event_type = 'Daily'
         AND date >= CURRENT_DATE - INTERVAL '30 days'
         AND description IS NOT NULL AND description != ''`;
    const params = [req.user.id];

    if (q && q.trim()) {
      query += ` AND LOWER(description) LIKE LOWER($2 || '%')`;
      params.push(q.trim());
    }

    query += ' ORDER BY description LIMIT 20';
    const { rows } = await pool.query(query, params);
    res.json({ descriptions: rows.map(r => r.description) });
  } catch (err) {
    console.error('GET /suggestions/descriptions error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
