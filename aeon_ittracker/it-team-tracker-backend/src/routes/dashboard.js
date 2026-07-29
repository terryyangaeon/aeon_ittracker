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

// ==================== WORKLOAD HEATMAP ====================
router.get('/workload-heatmap', authMiddleware, async (req, res) => {
  try {
    const weeks = parseInt(req.query.weeks) || 8;
    const { rows } = await pool.query(
      `SELECT u.name AS user_name, date_trunc('week', e.date)::date AS week_start,
              COUNT(*)::int AS entry_count
       FROM work_entries e
       JOIN users u ON e.user_id = u.id
       WHERE e.event_type = 'Daily'
         AND e.date >= CURRENT_DATE - ($1 || ' weeks')::INTERVAL
         AND u.role IN ('General', 'Reviewer')
       GROUP BY u.name, week_start
       ORDER BY week_start, u.name`,
      [weeks]
    );

    const weekSet = [...new Set(rows.map(r => r.week_start.toISOString().slice(0, 10)))].sort();
    const userSet = [...new Set(rows.map(r => r.user_name))].sort();

    res.json({ heatmap: rows, weeks: weekSet, users: userSet });
  } catch (err) {
    console.error('GET /dashboard/workload-heatmap error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== OBJECTIVE PROGRESS ====================
router.get('/objective-progress', authMiddleware, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const month = parseInt(req.query.month) || (new Date().getMonth() + 1);

    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).toISOString().slice(0, 10);

    const { rows: users } = await pool.query(
      "SELECT id, name FROM users WHERE role IN ('General', 'Reviewer') ORDER BY name"
    );

    const { rows: objectives } = await pool.query(
      'SELECT user_id, objectives FROM monthly_objectives WHERE year = $1 AND month = $2',
      [year, month]
    );

    const { rows: entryCounts } = await pool.query(
      `SELECT user_id, COUNT(*)::int AS cnt
       FROM work_entries
       WHERE event_type = 'Daily' AND date >= $1 AND date <= $2
         AND (status = 'Submitted' OR status = 'Reviewed')
       GROUP BY user_id`,
      [firstDay, lastDay]
    );

    // Count working days in the month (Mon-Fri)
    let workingDays = 0;
    const d = new Date(firstDay);
    const end = new Date(lastDay);
    while (d <= end) {
      const dow = d.getDay();
      if (dow >= 1 && dow <= 5) workingDays++;
      d.setDate(d.getDate() + 1);
    }

    const progress = users.map(u => {
      const obj = objectives.find(o => o.user_id === u.id);
      const ec = entryCounts.find(e => e.user_id === u.id);
      const entries = ec ? ec.cnt : 0;
      const hasObjective = obj && obj.objectives && obj.objectives.trim().length > 0;
      const ratio = workingDays > 0 ? entries / workingDays : 0;

      let rag = 'red';
      if (ratio >= 0.6 && hasObjective) rag = 'green';
      else if (ratio >= 0.3) rag = 'amber';

      return {
        user_name: u.name,
        user_id: u.id,
        objective_text: obj ? obj.objectives : '',
        working_days: workingDays,
        entries_count: entries,
        has_objective: hasObjective,
        rag_status: rag
      };
    });

    res.json({ progress, year, month });
  } catch (err) {
    console.error('GET /dashboard/objective-progress error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== BLOCKER ESCALATION ====================
router.get('/blocker-escalation', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT e.id, e.date, e.blockage, e.blockage_status, e.user_id, u.name AS user_name
       FROM work_entries e
       JOIN users u ON e.user_id = u.id
       WHERE e.event_type = 'Weekly'
         AND e.blockage IS NOT NULL AND e.blockage != ''
       ORDER BY e.date DESC, u.name`
    );

    res.json({ blockers: rows });
  } catch (err) {
    console.error('GET /dashboard/blocker-escalation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== UPDATE BLOCKER STATUS ====================
router.patch('/blocker-status/:id', authMiddleware, async (req, res) => {
  try {
    const { blockage_status } = req.body;
    if (!blockage_status || !['New', 'Resolved'].includes(blockage_status)) {
      return res.status(400).json({ error: 'blockage_status must be "New" or "Resolved"' });
    }
    const { rows } = await pool.query(
      'SELECT user_id FROM work_entries WHERE id = $1',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Entry not found' });

    if (rows[0].user_id !== req.user.id && !req.user.admin && req.user.role !== 'Reviewer') {
      return res.status(403).json({ error: 'Only the blocker owner, Reviewer, or Admin can update status' });
    }

    const { rows: updated } = await pool.query(
      'UPDATE work_entries SET blockage_status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, blockage_status',
      [blockage_status, req.params.id]
    );
    res.json({ entry: updated[0] });
  } catch (err) {
    console.error('PATCH /dashboard/blocker-status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== SITE ALLOCATION ====================
router.get('/site-allocation', authMiddleware, async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    if (!date_from || !date_to) {
      return res.status(400).json({ error: 'date_from and date_to are required' });
    }
    const { rows } = await pool.query(
      `SELECT s AS site, COUNT(*)::int AS visit_count
       FROM work_entries, unnest(sites) AS s
       WHERE event_type = 'Daily' AND date >= $1 AND date <= $2
       GROUP BY s ORDER BY visit_count DESC`,
      [date_from, date_to]
    );
    res.json({ allocation: rows });
  } catch (err) {
    console.error('GET /dashboard/site-allocation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
