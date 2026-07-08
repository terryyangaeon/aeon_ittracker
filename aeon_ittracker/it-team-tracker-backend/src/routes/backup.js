const { Router } = require('express');
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = Router();

// ==================== BACKUP (Admin only) ====================
router.get('/export', authMiddleware, async (req, res) => {
  try {
    if (!req.user.admin) return res.status(403).json({ error: 'Admin access required' });

    const { rows: users } = await pool.query('SELECT * FROM users ORDER BY name');
    const { rows: config } = await pool.query('SELECT * FROM system_config ORDER BY type, sort_order');
    const { rows: entries } = await pool.query('SELECT * FROM work_entries ORDER BY date DESC');
    const { rows: objectives } = await pool.query('SELECT * FROM monthly_objectives ORDER BY year DESC, month DESC');
    const { rows: emailAlerts } = await pool.query('SELECT * FROM email_alerts ORDER BY created_at');

    const backup = {
      version: '2.1',
      exported_at: new Date().toISOString(),
      exported_by: req.user.name,
      tables: {
        users: { count: users.length, data: users },
        system_config: { count: config.length, data: config },
        work_entries: { count: entries.length, data: entries },
        monthly_objectives: { count: objectives.length, data: objectives },
        email_alerts: { count: emailAlerts.length, data: emailAlerts }
      }
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition',
      'attachment; filename="it-tracker-backup-' + new Date().toISOString().slice(0, 10) + '.json"');
    res.json(backup);
  } catch (err) {
    console.error('GET /backup/export error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== RESTORE (Admin only) ====================
router.post('/restore', authMiddleware, async (req, res) => {
  try {
    if (!req.user.admin) return res.status(403).json({ error: 'Admin access required' });

    const { tables } = req.body;
    if (!tables) return res.status(400).json({ error: 'Invalid backup format: missing tables' });

    const client = await pool.connect();
    const results = { users: 0, system_config: 0, work_entries: 0, monthly_objectives: 0, email_alerts: 0 };

    try {
      await client.query('BEGIN');

      // Restore users
      if (tables.users && tables.users.data) {
        for (const u of tables.users.data) {
          await client.query(
            `INSERT INTO users (id, name, email, pin, role, admin, last_modified, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (id) DO UPDATE SET
               name = EXCLUDED.name, email = EXCLUDED.email, pin = EXCLUDED.pin,
               role = EXCLUDED.role, admin = EXCLUDED.admin, last_modified = EXCLUDED.last_modified`,
            [u.id, u.name, u.email, u.pin, u.role, u.admin, u.last_modified, u.created_at]
          );
          results.users++;
        }
      }

      // Restore system_config
      if (tables.system_config && tables.system_config.data) {
        for (const c of tables.system_config.data) {
          await client.query(
            `INSERT INTO system_config (id, type, value, display_value, sort_order, created_at)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (id) DO UPDATE SET
               type = EXCLUDED.type, value = EXCLUDED.value,
               display_value = EXCLUDED.display_value, sort_order = EXCLUDED.sort_order`,
            [c.id, c.type, c.value, c.display_value, c.sort_order, c.created_at]
          );
          results.system_config++;
        }
      }

      // Restore work_entries
      if (tables.work_entries && tables.work_entries.data) {
        for (const e of tables.work_entries.data) {
          await client.query(
            `INSERT INTO work_entries (id, user_id, date, event_type, sites, description, blockage, next_week_target, status, leave_am, leave_pm, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             ON CONFLICT (id) DO UPDATE SET
               sites = EXCLUDED.sites, description = EXCLUDED.description,
               blockage = EXCLUDED.blockage, next_week_target = EXCLUDED.next_week_target,
               status = EXCLUDED.status, leave_am = EXCLUDED.leave_am, leave_pm = EXCLUDED.leave_pm,
               updated_at = EXCLUDED.updated_at`,
            [e.id, e.user_id, e.date, e.event_type, e.sites, e.description, e.blockage, e.next_week_target, e.status, e.leave_am, e.leave_pm, e.created_at, e.updated_at]
          );
          results.work_entries++;
        }
      }

      // Restore monthly_objectives
      if (tables.monthly_objectives && tables.monthly_objectives.data) {
        for (const o of tables.monthly_objectives.data) {
          await client.query(
            `INSERT INTO monthly_objectives (id, user_id, year, month, objectives, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (id) DO UPDATE SET
               objectives = EXCLUDED.objectives, updated_at = EXCLUDED.updated_at`,
            [o.id, o.user_id, o.year, o.month, o.objectives, o.created_at, o.updated_at]
          );
          results.monthly_objectives++;
        }
      }

      // Restore email_alerts
      if (tables.email_alerts && tables.email_alerts.data) {
        for (const a of tables.email_alerts.data) {
          await client.query(
            `INSERT INTO email_alerts (id, name, subject, body, recipient_role, schedule_day, schedule_time, enabled, last_sent, last_result, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             ON CONFLICT (id) DO UPDATE SET
               name = EXCLUDED.name, subject = EXCLUDED.subject, body = EXCLUDED.body,
               recipient_role = EXCLUDED.recipient_role, schedule_day = EXCLUDED.schedule_day,
               schedule_time = EXCLUDED.schedule_time, enabled = EXCLUDED.enabled,
               updated_at = EXCLUDED.updated_at`,
            [a.id, a.name, a.subject, a.body, a.recipient_role, a.schedule_day, a.schedule_time, a.enabled, a.last_sent, a.last_result, a.created_at, a.updated_at]
          );
          results.email_alerts++;
        }
      }

      await client.query('COMMIT');
      res.json({ success: true, restored: results });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('POST /backup/restore error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== BACKUP STATUS ====================
router.get('/status', authMiddleware, async (req, res) => {
  try {
    if (!req.user.admin) return res.status(403).json({ error: 'Admin access required' });

    const { rows: [userCount] } = await pool.query('SELECT COUNT(*) AS count FROM users');
    const { rows: [configCount] } = await pool.query('SELECT COUNT(*) AS count FROM system_config');
    const { rows: [entryCount] } = await pool.query('SELECT COUNT(*) AS count FROM work_entries');
    const { rows: [objCount] } = await pool.query('SELECT COUNT(*) AS count FROM monthly_objectives');
    const { rows: [alertCount] } = await pool.query('SELECT COUNT(*) AS count FROM email_alerts');

    res.json({
      status: 'ok',
      counts: {
        users: parseInt(userCount.count),
        system_config: parseInt(configCount.count),
        work_entries: parseInt(entryCount.count),
        monthly_objectives: parseInt(objCount.count),
        email_alerts: parseInt(alertCount.count)
      }
    });
  } catch (err) {
    console.error('GET /backup/status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
