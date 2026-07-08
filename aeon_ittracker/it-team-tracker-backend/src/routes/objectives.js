const { Router } = require('express');
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { year, month, user_id } = req.query;
    let query = `SELECT o.*, u.name AS user_name
                 FROM monthly_objectives o JOIN users u ON o.user_id = u.id WHERE 1=1`;
    const params = [];
    let i = 1;
    if (year)    { query += ` AND o.year = $${i++}`;    params.push(parseInt(year)); }
    if (month)   { query += ` AND o.month = $${i++}`;   params.push(parseInt(month)); }
    if (user_id) { query += ` AND o.user_id = $${i++}`; params.push(user_id); }
    query += ' ORDER BY o.year DESC, o.month DESC, u.name';
    const { rows } = await pool.query(query, params);
    res.json({ objectives: rows });
  } catch (err) {
    console.error('GET /objectives error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { year, month, objectives, user_id } = req.body;
    if (!year || !month) {
      return res.status(400).json({ error: 'year and month are required' });
    }
    // Allow Reviewer/Admin to save for other users
    let targetUserId = req.user.id;
    if (user_id && user_id !== req.user.id) {
      if (req.user.role !== 'Reviewer' && !req.user.admin) {
        return res.status(403).json({ error: 'Not authorized to save for other users' });
      }
      targetUserId = user_id;
    }
    const { rows } = await pool.query(
      `INSERT INTO monthly_objectives (user_id, year, month, objectives, updated_at)
       VALUES ($1,$2,$3,$4, now())
       ON CONFLICT (user_id, year, month) DO UPDATE SET
         objectives = EXCLUDED.objectives,
         updated_at = now()
       RETURNING *`,
      [targetUserId, year, month, objectives || '']
    );
    res.status(201).json({ objective: rows[0] });
  } catch (err) {
    console.error('POST /objectives error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { rows: existing } = await pool.query('SELECT user_id FROM monthly_objectives WHERE id = $1', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Not found' });
    if (existing[0].user_id !== req.user.id && req.user.role !== 'Reviewer') {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const { objectives } = req.body;
    const { rows } = await pool.query(
      'UPDATE monthly_objectives SET objectives = $1, updated_at = now() WHERE id = $2 RETURNING *',
      [objectives || '', req.params.id]
    );
    res.json({ objective: rows[0] });
  } catch (err) {
    console.error('PUT /objectives error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
