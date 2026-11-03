const { Router } = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { JWT_SECRET, authMiddleware } = require('../middleware/auth');
const sso = require('../lib/sso');

const router = Router();

const FRONTEND_URL = process.env.FRONTEND_URL || '';
const PASSWORD_LOGIN = process.env.PASSWORD_LOGIN !== '0' || !sso.enabled();

function makeToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role, admin: user.admin, account_type: user.account_type || 'email' },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

// ==================== Auth Options ====================
router.get('/options', (_req, res) => {
  res.json({ sso: sso.enabled(), password: PASSWORD_LOGIN });
});

// ==================== PIN Login (email-type accounts only) ====================
router.post('/login', async (req, res) => {
  try {
    if (!PASSWORD_LOGIN) {
      return res.status(403).json({ error: '請使用 Microsoft 帳戶登入 · Please sign in with Microsoft.' });
    }
    const { email, pin } = req.body;
    if (!email || !pin) {
      return res.status(400).json({ error: 'Email and PIN are required' });
    }
    const { rows } = await pool.query(
      'SELECT id, name, email, role, admin, account_type FROM users WHERE LOWER(email) = LOWER($1) AND pin = $2',
      [email.trim(), pin]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or PIN' });
    }
    const user = rows[0];
    if (user.account_type === 'sso') {
      return res.status(403).json({ error: user.email + ' 是 SSO 帳戶,請使用公司帳戶登入。 · This is an SSO account — sign in with your company account.' });
    }
    await pool.query('UPDATE users SET last_modified = now() WHERE id = $1', [user.id]);
    const token = makeToken(user);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, admin: user.admin, account_type: user.account_type } });
  } catch (err) {
    console.error('POST /auth/login error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== Microsoft Entra ID SSO ====================
function escHtml(v) { return String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function popupPage(res, msg) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`<!doctype html><meta charset="utf-8"><title>Signing in…</title><body style="font-family:sans-serif;padding:24px">
<p>${escHtml(msg.error || 'Signed in — you can close this window.')}</p>
<script>try { window.opener.postMessage(${JSON.stringify(Object.assign({ type: 'itt-sso' }, msg)).replace(/</g, '\\u003c')}, '*'); } catch (e) {}
${msg.error ? '' : 'window.close();'}</script>`);
}

router.get('/sso/start', async (req, res) => {
  try {
    if (!sso.enabled()) {
      return res.redirect(FRONTEND_URL + '?sso_error=' + encodeURIComponent('Microsoft sign-in is not configured.'));
    }
    const url = await sso.startUrl(req, req.query.next || '', req.query.popup === '1');
    res.redirect(url);
  } catch (err) {
    console.error('SSO start error:', err.message);
    res.redirect(FRONTEND_URL + '?sso_error=' + encodeURIComponent(err.message));
  }
});

router.get('/sso/callback', async (req, res) => {
  let popup = false;
  try {
    const r = await sso.finish(req.query);
    popup = r.popup;

    // Look up the user — must be active + SSO-type
    const { rows } = await pool.query(
      'SELECT id, name, email, role, admin, account_type FROM users WHERE LOWER(email) = LOWER($1)',
      [r.email]
    );
    if (rows.length === 0) {
      throw new Error(r.email + ' 未獲授權使用本系統,請聯絡管理員。 · ' + r.email + ' has no account here — ask an admin to add you in Account Management.');
    }
    const user = rows[0];
    if (user.account_type !== 'sso') {
      throw new Error(user.email + ' 是電郵帳戶,請使用電郵及 PIN 登入。 · ' + user.email + ' is an Email account — sign in with email & PIN.');
    }

    // Fill in name from Entra if it was left blank
    if (!user.name && r.name) {
      await pool.query('UPDATE users SET name = $1, last_modified = now() WHERE id = $2', [r.name.slice(0, 200), user.id]);
      user.name = r.name.slice(0, 200);
    }
    await pool.query('UPDATE users SET last_modified = now() WHERE id = $1', [user.id]);

    if (popup) {
      return popupPage(res, { code: await sso.handoff(user.email) });
    }

    // Create a one-time code, redirect to frontend with it
    const code = await sso.handoff(user.email);
    res.redirect(FRONTEND_URL + '?sso_code=' + code);
  } catch (e) {
    console.warn('SSO sign-in failed:', e.message);
    if (popup || (e.st && e.st.popup)) return popupPage(res, { error: e.message });
    res.redirect(FRONTEND_URL + '?sso_error=' + encodeURIComponent(e.message));
  }
});

// Redeem one-time code for a JWT token
router.post('/sso/redeem', async (req, res) => {
  try {
    const email = await sso.redeem((req.body || {}).code);
    if (!email) return res.status(401).json({ error: 'Sign-in expired — please try again.' });

    const { rows } = await pool.query(
      'SELECT id, name, email, role, admin, account_type FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    if (rows.length === 0) return res.status(401).json({ error: 'Account not found.' });
    const user = rows[0];
    const token = makeToken(user);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, admin: user.admin, account_type: user.account_type } });
  } catch (err) {
    console.error('SSO redeem error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== Directory Check (for Account Management) ====================
router.post('/directory-check', authMiddleware, async (req, res) => {
  try {
    if (!req.user.admin) return res.status(403).json({ error: 'Admin access required' });
    if (!sso.enabled()) return res.status(400).json({ error: 'SSO is not configured.' });
    const email = (req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email is required.' });
    const u = await sso.directoryUser(email);
    if (!u) {
      return res.status(422).json({
        error: email + ' 不在公司目錄 (AD) 中,無法建立 SSO 帳戶。 · ' + email + ' was not found in the company directory.',
        code: 'not_in_directory'
      });
    }
    if (!u.enabled) {
      return res.status(422).json({
        error: email + ' 的公司帳戶已停用。 · The company account ' + email + ' is disabled in the directory.',
        code: 'directory_disabled'
      });
    }
    res.json({ displayName: u.displayName, email: u.upn || u.mail });
  } catch (err) {
    console.error('Directory check error:', err.message);
    res.status(err.status || 500).json({ error: err.message, code: err.code || null });
  }
});

// ==================== Change PIN (email-type only) ====================
router.post('/change-pin', authMiddleware, async (req, res) => {
  try {
    if (req.user.account_type === 'sso') {
      return res.status(403).json({ error: 'SSO accounts do not have a PIN.' });
    }
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

// ==================== User CRUD (Admin only) ====================
router.get('/users', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, email, role, admin, pin, account_type, last_modified, created_at FROM users ORDER BY role, name'
    );
    res.json({ users: rows });
  } catch (err) {
    console.error('GET /auth/users error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/users', authMiddleware, async (req, res) => {
  try {
    if (!req.user.admin) return res.status(403).json({ error: 'Admin access required' });
    const { name, email, pin, role, admin, account_type } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });
    const type = account_type || 'email';
    if (type === 'email' && pin && !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
    }
    const { rows } = await pool.query(
      'INSERT INTO users (name, email, pin, role, admin, account_type) VALUES ($1, LOWER($2), $3, $4, $5, $6) RETURNING id, name, email, role, admin, account_type, created_at',
      [name.trim(), email.trim(), type === 'sso' ? '0000' : (pin || '1111'), role || 'General', admin || false, type]
    );
    res.json({ user: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    console.error('POST /auth/users error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put('/users/:id', authMiddleware, async (req, res) => {
  try {
    if (!req.user.admin) return res.status(403).json({ error: 'Admin access required' });
    const { name, email, pin, role, admin, account_type } = req.body;
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
    if (account_type !== undefined) {
      fields.push('account_type = $' + idx++); values.push(account_type);
      if (account_type === 'sso') {
        fields.push('pin = $' + idx++); values.push('0000');
      }
    }
    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    fields.push('last_modified = now()');
    values.push(req.params.id);
    const { rows } = await pool.query(
      'UPDATE users SET ' + fields.join(', ') + ' WHERE id = $' + idx + ' RETURNING id, name, email, role, admin, account_type',
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
