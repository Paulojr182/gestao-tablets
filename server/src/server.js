const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { initDatabase, Tablet, TabletSession, TabletStatusLog } = require('./database');
const routes = require('./routes');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Enable CORS for dashboard and tablet apps in local network
app.use(cors());
app.use(express.json());

// Bind routes
app.use('/api', routes);

// Serve dashboard static files if built
app.use(express.static(path.join(__dirname, '..', '..', 'dashboard', 'dist')));

// WebSocket handling
const clients = new Set();
const tabletClients = new Map(); // Map of serialNumber -> WebSocket

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`WebSocket client connected (Total: ${clients.size})`);

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      // Register tablet's websocket connection
      if (data.type === 'tablet_connect' && data.serialNumber) {
        tabletClients.set(data.serialNumber, ws);
        ws.serialNumber = data.serialNumber;
        console.log(`Tablet socket registered for serial: ${data.serialNumber}`);
        
        // Update database status
        const tablet = await Tablet.findOne({ where: { serialNumber: data.serialNumber } });
        if (tablet) {
          const nextStatus = tablet.currentStudentId ? 'in_use' : 'online';
          await tablet.update({ status: nextStatus, lastSeen: new Date() });
          broadcast({ type: 'tablet_update', tablet });
        }
      }
    } catch (e) {
      console.error('Error handling WS message:', e);
    }
  });

  ws.on('close', async () => {
    clients.delete(ws);
    console.log(`WebSocket client disconnected (Total: ${clients.size})`);
    
    if (ws.serialNumber) {
      console.log(`Tablet socket disconnected for serial: ${ws.serialNumber}`);
      tabletClients.delete(ws.serialNumber);
      
      // Update database status (marks as offline immediately if socket disconnects or keep it for heartbeat)
      const tablet = await Tablet.findOne({ where: { serialNumber: ws.serialNumber } });
      if (tablet && tablet.status !== 'blocked') {
        await tablet.update({ status: 'offline' });
        await TabletStatusLog.create({
          tabletId: tablet.id,
          tabletName: tablet.name,
          status: 'offline',
          description: 'Conexão via WebSocket encerrada'
        });
        broadcast({ type: 'tablet_update', tablet });
      }
    }
  });
});

// Broadcaster helper to send messages to all dashboard/connected apps
function broadcast(data) {
  const payload = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// Attach broadcaster to routes so routes can send updates
routes.setBroadcaster(broadcast);

// WebSocket remote action helper (specific targeting for tablets)
function sendRemoteActionToTablet(serialNumber, action) {
  const ws = tabletClients.get(serialNumber);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'remote_action', action }));
    return true;
  }
  return false;
}

// Heartbeat checking interval - run every 15 seconds
// If a tablet's lastSeen is older than 30 seconds, mark it as offline
setInterval(async () => {
  try {
    const threshold = new Date(Date.now() - 30000); // 30 seconds ago
    const activeTablets = await Tablet.findAll({
      where: {
        status: ['online', 'in_use']
      }
    });

    for (const tablet of activeTablets) {
      const lastSeen = tablet.lastSeen ? new Date(tablet.lastSeen) : new Date(0);
      if (lastSeen < threshold) {
        await tablet.update({ status: 'offline' });
        
        // Log status change
        await TabletStatusLog.create({
          tabletId: tablet.id,
          tabletName: tablet.name,
          status: 'offline',
          description: 'Tablet inativo por mais de 30 segundos (Heartbeat perdido)'
        });

        // Close session if there was one active
        if (tablet.currentStudentId) {
          const activeSession = await TabletSession.findOne({ where: { tabletId: tablet.id, logoutTime: null } });
          if (activeSession) {
            const now = new Date();
            const diffSecs = Math.round((now - new Date(activeSession.loginTime)) / 1000);
            await activeSession.update({ logoutTime: now, durationSeconds: diffSecs });
          }
          await tablet.update({ currentStudentId: null });
        }

        console.log(`Tablet ${tablet.name} (S/N: ${tablet.serialNumber}) marked offline due to heartbeat timeout`);
        broadcast({ type: 'tablet_update', tablet });
      }
    }
  } catch (error) {
    console.error('Error running heartbeat check interval:', error);
  }
}, 15000);

// Initialize DB and launch server
initDatabase().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server API is running on http://localhost:${PORT}`);
    console.log(`Available on local network at http://[YOUR-IP]:${PORT}`);
  });
}).catch((err) => {
  console.error('Failed to initialize database:', err);
});
