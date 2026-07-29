const { Router } = require('express');
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = Router();

// ==================== GET SKILL PROFILE ====================
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = (req.query.user_id && (req.user.admin || req.user.role === 'Reviewer'))
      ? req.query.user_id
      : req.user.id;

    const { rows } = await pool.query(
      `SELECT s.*, u.name AS user_name
       FROM user_skills s JOIN users u ON s.user_id = u.id
       WHERE s.user_id = $1`,
      [userId]
    );
    res.json({ profile: rows[0] || null });
  } catch (err) {
    console.error('GET /skills error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== GET ALL PROFILES (Reviewer/Admin) ====================
router.get('/all', authMiddleware, async (req, res) => {
  try {
    if (!req.user.admin && req.user.role !== 'Reviewer') {
      return res.status(403).json({ error: 'Reviewer or Admin access required' });
    }
    const { rows } = await pool.query(
      `SELECT u.id AS user_id, u.name AS user_name, u.role,
              s.technical_skills, s.systems_experience, s.certifications,
              s.strengths, s.project_background, s.notes, s.updated_at
       FROM users u
       LEFT JOIN user_skills s ON s.user_id = u.id
       ORDER BY u.name`
    );
    res.json({ profiles: rows });
  } catch (err) {
    console.error('GET /skills/all error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== UPSERT SKILL PROFILE ====================
router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = (req.body.user_id && (req.user.admin || req.user.role === 'Reviewer'))
      ? req.body.user_id
      : req.user.id;

    const { technical_skills, systems_experience, certifications, strengths, project_background, notes } = req.body;

    const { rows } = await pool.query(
      `INSERT INTO user_skills (user_id, technical_skills, systems_experience, certifications, strengths, project_background, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id) DO UPDATE SET
         technical_skills = EXCLUDED.technical_skills,
         systems_experience = EXCLUDED.systems_experience,
         certifications = EXCLUDED.certifications,
         strengths = EXCLUDED.strengths,
         project_background = EXCLUDED.project_background,
         notes = EXCLUDED.notes,
         updated_at = NOW()
       RETURNING *`,
      [userId, technical_skills || [], systems_experience || [], certifications || [],
       strengths || '', project_background || '', notes || '']
    );
    res.json({ profile: rows[0] });
  } catch (err) {
    console.error('POST /skills error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
