const { Router } = require('express');
const pool = require('../db');

const router = Router();

// GET / — return all objectives
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, member, month, text, created_at FROM objectives ORDER BY created_at DESC'
    );
    res.json({ objectives: rows });
  } catch (err) {
    console.error('GET /objectives error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST / — create or upsert an objective
router.post('/', async (req, res) => {
  try {
    const { member, month, text } = req.body;
    if (!member || !month) {
      return res.status(400).json({ error: 'member and month are required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO objectives (member, month, text)
       VALUES ($1, $2, $3)
       ON CONFLICT (member, month) DO UPDATE SET text = EXCLUDED.text
       RETURNING *`,
      [member, month, text || '']
    );
    res.status(201).json({ objective: rows[0] });
  } catch (err) {
    console.error('POST /objectives error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id — update an existing objective
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    const { rows } = await pool.query(
      'UPDATE objectives SET text = $1 WHERE id = $2 RETURNING *',
      [text || '', id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Objective not found' });
    }
    res.json({ objective: rows[0] });
  } catch (err) {
    console.error('PUT /objectives error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id — remove an objective
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query('DELETE FROM objectives WHERE id = $1', [id]);
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Objective not found' });
    }
    res.json({ deleted: true });
  } catch (err) {
    console.error('DELETE /objectives error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
