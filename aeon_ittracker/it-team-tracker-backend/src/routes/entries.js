const { Router } = require('express');
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { user_id, event_type, date_from, date_to, status } = req.query;
    let query = `SELECT e.*, u.name AS user_name, u.email AS user_email
                 FROM work_entries e JOIN users u ON e.user_id = u.id WHERE 1=1`;
    const params = [];
    let i = 1;
    if (user_id)    { query += ` AND e.user_id = $${i++}`;    params.push(user_id); }
    if (event_type) { query += ` AND e.event_type = $${i++}`; params.push(event_type); }
    if (date_from)  { query += ` AND e.date >= $${i++}`;      params.push(date_from); }
    if (date_to)    { query += ` AND e.date <= $${i++}`;      params.push(date_to); }
    if (status)     { query += ` AND e.status = $${i++}`;     params.push(status); }
    query += ' ORDER BY e.date DESC, e.created_at DESC';
    const { rows } = await pool.query(query, params);
    res.json({ entries: rows });
  } catch (err) {
    console.error('GET /entries error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { date, event_type, sites, description, blockage, next_week_target, status, leave_am, leave_pm } = req.body;
    if (!date || !event_type) {
      return res.status(400).json({ error: 'date and event_type are required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO work_entries (user_id, date, event_type, sites, description, blockage, next_week_target, status, leave_am, leave_pm, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
       ON CONFLICT (user_id, date, event_type) DO UPDATE SET
         sites = EXCLUDED.sites,
         description = EXCLUDED.description,
         blockage = EXCLUDED.blockage,
         next_week_target = EXCLUDED.next_week_target,
         status = EXCLUDED.status,
         leave_am = EXCLUDED.leave_am,
         leave_pm = EXCLUDED.leave_pm,
         updated_at = now()
       RETURNING *`,
      [req.user.id, date, event_type, sites || [], description || '', blockage || '', next_week_target || '', status || 'Draft', leave_am || false, leave_pm || false]
    );
    res.status(201).json({ entry: rows[0] });
  } catch (err) {
    console.error('POST /entries error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { rows: existing } = await pool.query('SELECT user_id FROM work_entries WHERE id = $1', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Not found' });
    if (existing[0].user_id !== req.user.id && req.user.role !== 'Reviewer') {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const { sites, description, blockage, next_week_target, status, leave_am, leave_pm } = req.body;
    const { rows } = await pool.query(
      `UPDATE work_entries SET
         sites = COALESCE($1, sites),
         description = COALESCE($2, description),
         blockage = COALESCE($3, blockage),
         next_week_target = COALESCE($4, next_week_target),
         status = COALESCE($5, status),
         leave_am = COALESCE($6, leave_am),
         leave_pm = COALESCE($7, leave_pm),
         updated_at = now()
       WHERE id = $8 RETURNING *`,
      [sites, description, blockage, next_week_target, status, leave_am, leave_pm, req.params.id]
    );
    res.json({ entry: rows[0] });
  } catch (err) {
    console.error('PUT /entries error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT user_id FROM work_entries WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    if (rows[0].user_id !== req.user.id && req.user.role !== 'Reviewer') {
      return res.status(403).json({ error: 'Not authorized' });
    }
    await pool.query('DELETE FROM work_entries WHERE id = $1', [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    console.error('DELETE /entries error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
