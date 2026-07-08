const { Router } = require('express');
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { type } = req.query;
    let query = 'SELECT * FROM system_config';
    const params = [];
    if (type) {
      query += ' WHERE type = $1';
      params.push(type);
    }
    query += ' ORDER BY type, sort_order, display_value';
    const { rows } = await pool.query(query, params);
    res.json({ config: rows });
  } catch (err) {
    console.error('GET /config error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { type, value, display_value, sort_order } = req.body;
    if (!type) return res.status(400).json({ error: 'Type is required' });
    const { rows } = await pool.query(
      'INSERT INTO system_config (type, value, display_value, sort_order) VALUES ($1,$2,$3,$4) RETURNING *',
      [type, value || '', display_value || '', sort_order || 0]
    );
    res.status(201).json({ config: rows[0] });
  } catch (err) {
    console.error('POST /config error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { type, value, display_value, sort_order } = req.body;
    const { rows } = await pool.query(
      `UPDATE system_config
       SET type = COALESCE($1, type),
           value = COALESCE($2, value),
           display_value = COALESCE($3, display_value),
           sort_order = COALESCE($4, sort_order)
       WHERE id = $5 RETURNING *`,
      [type, value, display_value, sort_order, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ config: rows[0] });
  } catch (err) {
    console.error('PUT /config error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM system_config WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error('DELETE /config error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
