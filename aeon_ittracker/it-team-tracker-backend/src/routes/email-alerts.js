const { Router } = require('express');
const nodemailer = require('nodemailer');
const pool = require('../db');
const { authMiddleware } = require('../middleware/auth');

const router = Router();

// ==================== GET ALL ALERTS (Admin only) ====================
router.get('/', authMiddleware, async (req, res) => {
  try {
    if (!req.user.admin) return res.status(403).json({ error: 'Admin access required' });
    const { rows } = await pool.query('SELECT * FROM email_alerts ORDER BY created_at');
    res.json({ alerts: rows });
  } catch (err) {
    console.error('GET /email-alerts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== CREATE ALERT (Admin only) ====================
router.post('/', authMiddleware, async (req, res) => {
  try {
    if (!req.user.admin) return res.status(403).json({ error: 'Admin access required' });
    const { name, subject, body, recipient_role, schedule_day, schedule_time, enabled } = req.body;
    if (!name) return res.status(400).json({ error: 'Alert name is required' });
    const { rows } = await pool.query(
      `INSERT INTO email_alerts (name, subject, body, recipient_role, schedule_day, schedule_time, enabled)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, subject || '', body || '', recipient_role || 'General',
       schedule_day || 'Friday', schedule_time || '15:00', enabled !== false]
    );
    res.status(201).json({ alert: rows[0] });
  } catch (err) {
    console.error('POST /email-alerts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== UPDATE ALERT (Admin only) ====================
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    if (!req.user.admin) return res.status(403).json({ error: 'Admin access required' });
    const { name, subject, body, recipient_role, schedule_day, schedule_time, enabled } = req.body;
    const { rows } = await pool.query(
      `UPDATE email_alerts SET
        name = COALESCE($1, name),
        subject = COALESCE($2, subject),
        body = COALESCE($3, body),
        recipient_role = COALESCE($4, recipient_role),
        schedule_day = COALESCE($5, schedule_day),
        schedule_time = COALESCE($6, schedule_time),
        enabled = COALESCE($7, enabled),
        updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [name, subject, body, recipient_role, schedule_day, schedule_time, enabled, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Alert not found' });
    res.json({ alert: rows[0] });
  } catch (err) {
    console.error('PUT /email-alerts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== DELETE ALERT (Admin only) ====================
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    if (!req.user.admin) return res.status(403).json({ error: 'Admin access required' });
    const { rowCount } = await pool.query('DELETE FROM email_alerts WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Alert not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error('DELETE /email-alerts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== SEND TEST EMAIL (Admin only) ====================
router.post('/:id/test', authMiddleware, async (req, res) => {
  try {
    if (!req.user.admin) return res.status(403).json({ error: 'Admin access required' });

    // Get alert
    const { rows: alerts } = await pool.query('SELECT * FROM email_alerts WHERE id = $1', [req.params.id]);
    if (alerts.length === 0) return res.status(404).json({ error: 'Alert not found' });
    const alert = alerts[0];

    // Send test to the requesting admin only
    const result = await sendAlertEmail(alert, [{ name: req.user.name, email: req.user.email }]);
    res.json({ success: result.success, message: result.message });
  } catch (err) {
    console.error('POST /email-alerts/:id/test error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== SEND NOW (Admin only) ====================
router.post('/:id/send', authMiddleware, async (req, res) => {
  try {
    if (!req.user.admin) return res.status(403).json({ error: 'Admin access required' });

    const { rows: alerts } = await pool.query('SELECT * FROM email_alerts WHERE id = $1', [req.params.id]);
    if (alerts.length === 0) return res.status(404).json({ error: 'Alert not found' });
    const alert = alerts[0];

    // Get recipients
    const { rows: recipients } = await pool.query(
      'SELECT name, email FROM users WHERE role = $1',
      [alert.recipient_role]
    );

    if (recipients.length === 0) {
      return res.json({ success: false, message: 'No recipients found with role: ' + alert.recipient_role });
    }

    const result = await sendAlertEmail(alert, recipients);

    // Update last_sent
    await pool.query(
      'UPDATE email_alerts SET last_sent = NOW(), last_result = $1 WHERE id = $2',
      [result.message, alert.id]
    );

    res.json({ success: result.success, message: result.message, recipientCount: recipients.length });
  } catch (err) {
    console.error('POST /email-alerts/:id/send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== GET SMTP CONFIG ====================
router.get('/smtp', authMiddleware, async (req, res) => {
  try {
    if (!req.user.admin) return res.status(403).json({ error: 'Admin access required' });
    const { rows } = await pool.query(
      "SELECT * FROM system_config WHERE type = 'SMTP' ORDER BY sort_order"
    );
    const smtp = {};
    rows.forEach(r => { smtp[r.value] = r.display_value; });
    res.json({ smtp, raw: rows });
  } catch (err) {
    console.error('GET /email-alerts/smtp error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== HELPER: Send Email ====================
async function sendAlertEmail(alert, recipients) {
  try {
    // Get SMTP config
    const { rows: smtpRows } = await pool.query(
      "SELECT value, display_value FROM system_config WHERE type = 'SMTP' ORDER BY sort_order"
    );
    const smtp = {};
    smtpRows.forEach(r => { smtp[r.value] = r.display_value; });

    if (!smtp.host || !smtp.user) {
      return { success: false, message: 'SMTP not configured. Please set SMTP host and user in System Config.' };
    }

    // Use SMTP user as sender email (must match the authenticated account)
    const senderEmail = smtp.user;

    // Create transporter
    const port = parseInt(smtp.port) || 587;
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: port,
      secure: port === 465,
      auth: {
        user: smtp.user,
        pass: smtp.password || ''
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    // Build recipient list
    const toList = recipients.map(r => r.email).join(', ');

    // Send email
    const info = await transporter.sendMail({
      from: '"IT Team Tracker" <' + senderEmail + '>',
      to: toList,
      subject: alert.subject,
      text: alert.body,
      html: buildEmailHtml(alert)
    });

    const msg = 'Email sent to ' + recipients.length + ' recipient(s). MessageID: ' + info.messageId;
    console.log('Email alert sent:', msg);
    return { success: true, message: msg };
  } catch (err) {
    const msg = 'Failed to send: ' + err.message;
    console.error('Email send error:', msg);
    return { success: false, message: msg };
  }
}

function buildEmailHtml(alert) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <div style="background: #2d6a4f; color: #ffffff; padding: 20px 24px;">
      <h1 style="margin: 0; font-size: 20px;">IT Team Tracker</h1>
    </div>
    <div style="padding: 24px;">
      <h2 style="color: #1a1a1a; margin: 0 0 16px 0; font-size: 18px;">${alert.subject}</h2>
      <div style="color: #333; font-size: 15px; line-height: 1.6; white-space: pre-line;">${alert.body}</div>
      <div style="margin-top: 24px;">
        <a href="https://adg-it-tracker.zeabur.app/" style="display: inline-block; background: #2d6a4f; color: #ffffff; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Open IT Tracker</a>
      </div>
    </div>
    <div style="background: #f5f5f0; padding: 12px 24px; font-size: 12px; color: #999;">
      This is an automated reminder from IT Team Tracker.
    </div>
  </div>
</body>
</html>`;
}

// ==================== SCHEDULED EMAIL SENDER ====================
async function checkAndSendScheduledAlerts() {
  try {
    const now = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = days[now.getDay()];
    const currentTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

    // Get enabled alerts for today
    const { rows: alerts } = await pool.query(
      'SELECT * FROM email_alerts WHERE enabled = true AND schedule_day = $1',
      [currentDay]
    );

    for (const alert of alerts) {
      // Check if time matches (within 1 minute window)
      if (currentTime === alert.schedule_time) {
        // Check if already sent today
        if (alert.last_sent) {
          const lastSent = new Date(alert.last_sent);
          const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          if (lastSent >= todayStart) {
            console.log('Alert "' + alert.name + '" already sent today, skipping.');
            continue;
          }
        }

        console.log('Triggering scheduled alert: ' + alert.name);

        // Get recipients
        const { rows: recipients } = await pool.query(
          'SELECT name, email FROM users WHERE role = $1',
          [alert.recipient_role]
        );

        if (recipients.length > 0) {
          const result = await sendAlertEmail(alert, recipients);
          await pool.query(
            'UPDATE email_alerts SET last_sent = NOW(), last_result = $1 WHERE id = $2',
            [result.message, alert.id]
          );
        }
      }
    }
  } catch (err) {
    console.error('Scheduled email check error:', err.message);
  }
}

module.exports = router;
module.exports.checkAndSendScheduledAlerts = checkAndSendScheduledAlerts;
