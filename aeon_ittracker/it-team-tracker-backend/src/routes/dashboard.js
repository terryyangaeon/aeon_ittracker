const { Router } = require('express');
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = Router();

router.get('/weekly-summary', authMiddleware, async (req, res) => {
  try {
    const { monday, friday } = req.query;
    if (!monday || !friday) {
      return res.status(400).json({ error: 'monday and friday query params are required' });
    }

    const { rows: users } = await pool.query(
      "SELECT id, name, role FROM users WHERE role IN ('General', 'Reviewer') ORDER BY name"
    );

    const { rows: dailyEntries } = await pool.query(
      `SELECT e.*, u.name AS user_name
       FROM work_entries e JOIN users u ON e.user_id = u.id
       WHERE e.event_type = 'Daily' AND e.date >= $1 AND e.date <= $2
       ORDER BY e.date DESC`,
      [monday, friday]
    );

    const { rows: weeklyEntries } = await pool.query(
      `SELECT e.*, u.name AS user_name
       FROM work_entries e JOIN users u ON e.user_id = u.id
       WHERE e.event_type = 'Weekly' AND e.date >= $1 AND e.date <= $2`,
      [monday, friday]
    );

    const perUser = {};
    for (const u of users) {
      const userDaily = dailyEntries.filter(e => e.user_id === u.id);
      const submitted = userDaily.filter(e => e.status === 'Submitted' || e.status === 'Reviewed').length;
      const outsideDays = userDaily.filter(e => e.sites.length > 0 && !e.sites.every(s => s === 'Back Office')).length;
      let leaveDays = 0;
      userDaily.forEach(e => {
        if (e.leave_am) leaveDays += 0.5;
        if (e.leave_pm) leaveDays += 0.5;
      });
      perUser[u.name] = { submitted, total: 5, outsideDays, leaveDays };
    }

    const weeklyBlockages = weeklyEntries.filter(e => e.blockage && e.blockage.trim());
    const totalBlockages = weeklyBlockages.length;

    res.json({ perUser, totalBlockages, weeklyBlockages, dailyEntries, users });
  } catch (err) {
    console.error('GET /dashboard/weekly-summary error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
