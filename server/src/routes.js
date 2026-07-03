const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Admin, Student, Tablet, TabletSession, TabletStatusLog } = require('./database');

const JWT_SECRET = process.env.JWT_SECRET || 'secret-controle-tablets';

// Helper function to log tablet state changes
async function logStatusChange(tabletId, tabletName, status, description) {
  try {
    await TabletStatusLog.create({ tabletId, tabletName, status, description });
  } catch (error) {
    console.error('Error logging status change:', error);
  }
}

// Global active WebSockets broadcaster (will be set by server.js)
let wsBroadcaster = () => {};
router.setBroadcaster = (fn) => {
  wsBroadcaster = fn;
};

// -------------------------------------------------------------
// ADMIN AUTHENTICATION
// -------------------------------------------------------------
router.post('/admin/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const admin = await Admin.findOne({ where: { username } });
    if (!admin) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    const match = await bcrypt.compare(password, admin.passwordHash);
    if (!match) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, username: admin.username });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Middleware to verify Admin JWT
function adminAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Acesso negado' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido ou expirado' });
    req.admin = user;
    next();
  });
}

// -------------------------------------------------------------
// TABLET AUTHENTICATION & LOGIN (FOR MOBILE APP)
// -------------------------------------------------------------
router.post('/tablet/register-or-ping', async (req, res) => {
  const { serialNumber, name } = req.body;
  if (!serialNumber || !name) {
    return res.status(400).json({ error: 'Número de série e Nome são obrigatórios' });
  }
  try {
    let tablet = await Tablet.findOne({ where: { serialNumber } });
    if (!tablet) {
      tablet = await Tablet.create({ serialNumber, name, status: 'online', lastSeen: new Date() });
      await logStatusChange(tablet.id, tablet.name, 'online', 'Tablet registrado e conectado pela primeira vez');
    } else {
      // If was blocked, do not reset status to online automatically
      const newStatus = tablet.status === 'blocked' ? 'blocked' : (tablet.currentStudentId ? 'in_use' : 'online');
      await tablet.update({ name, status: newStatus, lastSeen: new Date() });
    }
    wsBroadcaster({ type: 'tablet_update', tablet });
    res.json({ status: tablet.status, tabletId: tablet.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/tablet/login', async (req, res) => {
  const { serialNumber, enrollmentId, password } = req.body;
  try {
    const tablet = await Tablet.findOne({ where: { serialNumber } });
    if (!tablet) return res.status(404).json({ error: 'Tablet não cadastrado no servidor' });
    if (tablet.status === 'blocked') return res.status(403).json({ error: 'Tablet está bloqueado administrativamente' });

    // 1. Check if the password is the Master Admin unlock key
    const isMasterAdminOverride = (password === 'admin1234');
    
    let student;
    if (isMasterAdminOverride) {
      // Find or assign to a generic administrative/support session student
      student = await Student.findOne({ where: { enrollmentId: 'ADMIN_BYPASS' } });
      if (!student) {
        student = await Student.create({
          enrollmentId: 'ADMIN_BYPASS',
          name: 'Suporte Técnico (Bypass)',
          className: 'TI / Administração',
          active: true
        });
      }
    } else {
      // Verify standard student
      student = await Student.findOne({ where: { enrollmentId, active: true } });
      if (!student) return res.status(404).json({ error: 'Estudante não encontrado ou inativo' });
      
      // Match password
      if (student.passwordHash) {
        const match = await bcrypt.compare(password || '', student.passwordHash);
        if (!match) {
          return res.status(401).json({ error: 'Senha incorreta para o estudante' });
        }
      }
    }

    // Close any previous open session for this tablet
    await TabletSession.update(
      { logoutTime: new Date(), durationSeconds: 0 },
      { where: { tabletId: tablet.id, logoutTime: null } }
    );

    // Create session
    const session = await TabletSession.create({
      tabletId: tablet.id,
      studentId: student.id,
      studentName: student.name,
      tabletName: tablet.name,
      loginTime: new Date()
    });

    // Update tablet status
    await tablet.update({
      status: 'in_use',
      currentStudentId: student.id,
      lastSeen: new Date()
    });

    await logStatusChange(tablet.id, tablet.name, 'in_use', `Sessão iniciada pelo estudante ${student.name} ${isMasterAdminOverride ? '(Bypass Admin)' : ''}`);
    wsBroadcaster({ type: 'tablet_update', tablet });

    res.json({ success: true, sessionToken: 'session-' + session.id, studentName: student.name });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/tablet/logout', async (req, res) => {
  const { serialNumber } = req.body;
  try {
    const tablet = await Tablet.findOne({ where: { serialNumber } });
    if (!tablet) return res.status(404).json({ error: 'Tablet não encontrado' });

    const activeSession = await TabletSession.findOne({ where: { tabletId: tablet.id, logoutTime: null } });
    if (activeSession) {
      const now = new Date();
      const diffSecs = Math.round((now - new Date(activeSession.loginTime)) / 1000);
      await activeSession.update({
        logoutTime: now,
        durationSeconds: diffSecs
      });
    }

    await tablet.update({
      status: tablet.status === 'blocked' ? 'blocked' : 'online',
      currentStudentId: null,
      lastSeen: new Date()
    });

    await logStatusChange(tablet.id, tablet.name, 'online', 'Estudante realizou logout voluntariamente');
    wsBroadcaster({ type: 'tablet_update', tablet });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Periodic Tablet Heartbeat / Ping
router.post('/tablet/heartbeat', async (req, res) => {
  const { serialNumber } = req.body;
  try {
    const tablet = await Tablet.findOne({ where: { serialNumber } });
    if (!tablet) return res.status(404).json({ error: 'Tablet não encontrado' });
    
    // Update last seen
    await tablet.update({ lastSeen: new Date() });
    
    // If tablet was offline, restore status
    if (tablet.status === 'offline') {
      const restoredStatus = tablet.currentStudentId ? 'in_use' : 'online';
      await tablet.update({ status: restoredStatus });
      await logStatusChange(tablet.id, tablet.name, restoredStatus, 'Tablet restabeleceu conexão');
    }
    
    wsBroadcaster({ type: 'tablet_update', tablet });
    res.json({ status: tablet.status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// TABLETS MANAGEMENT (ADMIN ROUTE)
// -------------------------------------------------------------
router.get('/admin/tablets', adminAuth, async (req, res) => {
  try {
    const tablets = await Tablet.findAll();
    res.json(tablets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/admin/tablets', adminAuth, async (req, res) => {
  const { serialNumber, name } = req.body;
  try {
    const tablet = await Tablet.create({ serialNumber, name, status: 'offline' });
    wsBroadcaster({ type: 'tablet_update', tablet });
    res.json(tablet);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/admin/tablets/:id', adminAuth, async (req, res) => {
  const { name, serialNumber } = req.body;
  try {
    const tablet = await Tablet.findByPk(req.params.id);
    if (!tablet) return res.status(404).json({ error: 'Tablet não encontrado' });
    await tablet.update({ name, serialNumber });
    wsBroadcaster({ type: 'tablet_update', tablet });
    res.json(tablet);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/admin/tablets/:id', adminAuth, async (req, res) => {
  try {
    const tablet = await Tablet.findByPk(req.params.id);
    if (!tablet) return res.status(404).json({ error: 'Tablet não encontrado' });
    await tablet.destroy();
    wsBroadcaster({ type: 'tablet_delete', id: req.params.id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remote Admin actions: Block/Unblock & Remote Logout
router.post('/admin/tablets/:id/block', adminAuth, async (req, res) => {
  try {
    const tablet = await Tablet.findByPk(req.params.id);
    if (!tablet) return res.status(404).json({ error: 'Tablet não encontrado' });
    
    await tablet.update({ status: 'blocked' });
    await logStatusChange(tablet.id, tablet.name, 'blocked', 'Tablet bloqueado remotamente pelo painel administrativo');
    
    wsBroadcaster({ type: 'remote_action', action: 'block', tabletId: tablet.id, serialNumber: tablet.serialNumber });
    wsBroadcaster({ type: 'tablet_update', tablet });
    
    res.json(tablet);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/admin/tablets/:id/unblock', adminAuth, async (req, res) => {
  try {
    const tablet = await Tablet.findByPk(req.params.id);
    if (!tablet) return res.status(404).json({ error: 'Tablet não encontrado' });
    
    const nextStatus = tablet.currentStudentId ? 'in_use' : 'online';
    await tablet.update({ status: nextStatus });
    await logStatusChange(tablet.id, tablet.name, nextStatus, 'Tablet desbloqueado remotamente pelo painel administrativo');
    
    wsBroadcaster({ type: 'remote_action', action: 'unblock', tabletId: tablet.id, serialNumber: tablet.serialNumber });
    wsBroadcaster({ type: 'tablet_update', tablet });
    
    res.json(tablet);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/admin/tablets/:id/logout', adminAuth, async (req, res) => {
  try {
    const tablet = await Tablet.findByPk(req.params.id);
    if (!tablet) return res.status(404).json({ error: 'Tablet não encontrado' });
    
    const activeSession = await TabletSession.findOne({ where: { tabletId: tablet.id, logoutTime: null } });
    if (activeSession) {
      const now = new Date();
      const diffSecs = Math.round((now - new Date(activeSession.loginTime)) / 1000);
      await activeSession.update({ logoutTime: now, durationSeconds: diffSecs });
    }
    
    await tablet.update({
      status: tablet.status === 'blocked' ? 'blocked' : 'online',
      currentStudentId: null
    });
    
    await logStatusChange(tablet.id, tablet.name, 'online', 'Logout realizado remotamente pelo painel administrativo');
    
    wsBroadcaster({ type: 'remote_action', action: 'logout', tabletId: tablet.id, serialNumber: tablet.serialNumber });
    wsBroadcaster({ type: 'tablet_update', tablet });
    
    res.json(tablet);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// STUDENTS MANAGEMENT (ADMIN ROUTE)
// -------------------------------------------------------------
router.get('/admin/students', adminAuth, async (req, res) => {
  try {
    const students = await Student.findAll();
    res.json(students);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/admin/students', adminAuth, async (req, res) => {
  const { enrollmentId, name, className, active, password } = req.body;
  try {
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;
    const student = await Student.create({ enrollmentId, name, className, passwordHash, active: active !== false });
    res.json(student);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/admin/students/:id', adminAuth, async (req, res) => {
  const { enrollmentId, name, className, active, password } = req.body;
  try {
    const student = await Student.findByPk(req.params.id);
    if (!student) return res.status(404).json({ error: 'Estudante não encontrado' });
    
    const updates = { enrollmentId, name, className, active };
    if (password) {
      updates.passwordHash = await bcrypt.hash(password, 10);
    }
    
    await student.update(updates);
    res.json(student);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk Import Students from CSV
router.post('/admin/students/import', adminAuth, async (req, res) => {
  const { csvText } = req.body;
  if (!csvText) {
    return res.status(400).json({ error: 'Nenhum conteúdo CSV fornecido' });
  }

  try {
    const lines = csvText.split('\n');
    let importedCount = 0;
    
    // Expecting: enrollmentId,name,className,password
    // Skipping header if it matches enrollmentId/matricula
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
      if (cols[0].toLowerCase() === 'matricula' || cols[0].toLowerCase() === 'enrollmentid') {
        continue; // Skip header
      }

      if (cols.length >= 3) {
        const enrollmentId = cols[0];
        const name = cols[1];
        const className = cols[2];
        const plainPassword = cols[3] || '123456'; // Default if empty

        const passwordHash = await bcrypt.hash(plainPassword, 10);
        
        // Find existing or create new
        const existing = await Student.findOne({ where: { enrollmentId } });
        if (existing) {
          await existing.update({ name, className, passwordHash });
        } else {
          await Student.create({ enrollmentId, name, className, passwordHash, active: true });
        }
        importedCount++;
      }
    }

    res.json({ success: true, count: importedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/admin/students/:id', adminAuth, async (req, res) => {
  try {
    const student = await Student.findByPk(req.params.id);
    if (!student) return res.status(404).json({ error: 'Estudante não encontrado' });
    await student.destroy();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// LOGS & HISTORY (ADMIN ROUTE)
// -------------------------------------------------------------
router.get('/admin/history/sessions', adminAuth, async (req, res) => {
  try {
    const sessions = await TabletSession.findAll({ order: [['loginTime', 'DESC']], limit: 500 });
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/admin/history/status-logs', adminAuth, async (req, res) => {
  try {
    const logs = await TabletStatusLog.findAll({ order: [['timestamp', 'DESC']], limit: 500 });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
