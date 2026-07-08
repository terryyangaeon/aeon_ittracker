const { Router } = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { JWT_SECRET, authMiddleware } = require('../middleware/auth');

const router = Router();

router.post('/login', async (req, res) => {
  try {
    const { email, pin } = req.body;
    if (!email || !pin) {
      return res.status(400).json({ error: 'Email and PIN are required' });
    }
    const { rows } = await pool.query(
      'SELECT id, name, email, role, admin FROM users WHERE LOWER(email) = LOWER($1) AND pin = $2',
      [email.trim(), pin]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or PIN' });
    }
    const user = rows[0];
    await pool.query('UPDATE users SET last_modified = now() WHERE id = $1', [user.id]);
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role, admin: user.admin },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ token, user });
  } catch (err) {
    console.error('POST /auth/login error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/change-pin', authMiddleware, async (req, res) => {
  try {
    const { currentPin, newPin } = req.body;
    if (!currentPin || !newPin) {
      return res.status(400).json({ error: 'Current PIN and new PIN are required' });
    }
    if (!/^\d{4}$/.test(newPin)) {
      return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
    }
    const { rows } = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND pin = $2',
      [req.user.id, currentPin]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Current PIN is incorrect' });
    }
    await pool.query(
      'UPDATE users SET pin = $1, last_modified = now() WHERE id = $2',
      [newPin, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('POST /auth/change-pin error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/users', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, role, admin, pin, last_modified, created_at FROM users ORDER BY role, name'
    );
    res.json({ users: rows });
  } catch (err) {
    console.error('GET /auth/users error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== ADMIN: Create User ====================
router.post('/users', authMiddleware, async (req, res) => {
  try {
    if (!req.user.admin) return res.status(403).json({ error: 'Admin access required' });
    const { name, email, pin, role, admin } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
    if (pin && !/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
    const { rows } = await pool.query(
      'INSERT INTO users (name, email, pin, role, admin) VALUES ($1, LOWER($2), $3, $4, $5) RETURNING id, name, email, role, admin, created_at',
      [name.trim(), email.trim(), pin || '1111', role || 'General', admin || false]
    );
    res.json({ user: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    console.error('POST /auth/users error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== ADMIN: Update User ====================
router.put('/users/:id', authMiddleware, async (req, res) => {
  try {
    if (!req.user.admin) return res.status(403).json({ error: 'Admin access required' });
    const { name, email, pin, role, admin } = req.body;
    const fields = [];
    const values = [];
    let idx = 1;
    if (name !== undefined) { fields.push('name = $' + idx++); values.push(name.trim()); }
    if (email !== undefined) { fields.push('email = $' + idx++); values.push(email.trim().toLowerCase()); }
    if (pin !== undefined) {
      if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
      fields.push('pin = $' + idx++); values.push(pin);
    }
    if (role !== undefined) { fields.push('role = $' + idx++); values.push(role); }
    if (admin !== undefined) { fields.push('admin = $' + idx++); values.push(admin); }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    fields.push('last_modified = now()');
    values.push(req.params.id);
    const { rows } = await pool.query(
      'UPDATE users SET ' + fields.join(', ') + ' WHERE id = $' + idx + ' RETURNING id, name, email, role, admin',
      values
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    console.error('PUT /auth/users/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
