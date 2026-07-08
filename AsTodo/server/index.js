const express = require('express');
const { WebSocketServer } = require('ws');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');
const http = require('http');
const os = require('os');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// DB setup
const db = new Database(path.join(os.homedir(), '.astodo.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    type TEXT DEFAULT 'note',
    priority TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'todo',
    project TEXT DEFAULT 'General',
    tags TEXT DEFAULT '[]',
    ai_suggestion TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT
  );
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT DEFAULT '#6366f1',
    created_at TEXT DEFAULT (datetime('now'))
  );
  INSERT OR IGNORE INTO projects (name, color) VALUES ('General', '#6366f1');
`);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

// Broadcast to all connected clients
function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

// ─── Tasks API ───────────────────────────────────────────────
app.get('/api/tasks', (req, res) => {
  const { project, type, status, priority, search } = req.query;
  let query = 'SELECT * FROM tasks WHERE 1=1';
  const params = [];

  if (project) { query += ' AND project = ?'; params.push(project); }
  if (type) { query += ' AND type = ?'; params.push(type); }
  if (status) { query += ' AND status = ?'; params.push(status); }
  if (priority) { query += ' AND priority = ?'; params.push(priority); }
  if (search) { query += ' AND (title LIKE ? OR description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

  query += ' ORDER BY CASE priority WHEN "urgent" THEN 1 WHEN "high" THEN 2 WHEN "medium" THEN 3 WHEN "low" THEN 4 END, created_at DESC';

  const tasks = db.prepare(query).all(...params);
  res.json(tasks.map(t => ({ ...t, tags: JSON.parse(t.tags || '[]') })));
});

app.post('/api/tasks', (req, res) => {
  const { title, description = '', type = 'note', priority = 'medium', status = 'todo', project = 'General', tags = [], ai_suggestion = '' } = req.body;
  const result = db.prepare(
    'INSERT INTO tasks (title, description, type, priority, status, project, tags, ai_suggestion) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(title, description, type, priority, status, project, JSON.stringify(tags), ai_suggestion);

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  const parsed = { ...task, tags: JSON.parse(task.tags || '[]') };
  broadcast({ event: 'task:created', data: parsed });
  res.json(parsed);
});

app.put('/api/tasks/:id', (req, res) => {
  const { title, description, type, priority, status, project, tags, ai_suggestion } = req.body;
  const completedAt = status === 'done' ? new Date().toISOString() : null;

  db.prepare(`
    UPDATE tasks SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      type = COALESCE(?, type),
      priority = COALESCE(?, priority),
      status = COALESCE(?, status),
      project = COALESCE(?, project),
      tags = COALESCE(?, tags),
      ai_suggestion = COALESCE(?, ai_suggestion),
      completed_at = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(title, description, type, priority, status, project, tags ? JSON.stringify(tags) : null, ai_suggestion, completedAt, req.params.id);

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  const parsed = { ...task, tags: JSON.parse(task.tags || '[]') };
  broadcast({ event: 'task:updated', data: parsed });
  res.json(parsed);
});

app.delete('/api/tasks/:id', (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  broadcast({ event: 'task:deleted', data: { id: req.params.id } });
  res.json({ ok: true });
});

// ─── Projects API ─────────────────────────────────────────────
app.get('/api/projects', (req, res) => {
  const projects = db.prepare('SELECT p.*, COUNT(t.id) as task_count FROM projects p LEFT JOIN tasks t ON t.project = p.name GROUP BY p.id').all();
  res.json(projects);
});

app.post('/api/projects', (req, res) => {
  const { name, color = '#6366f1' } = req.body;
  const result = db.prepare('INSERT OR IGNORE INTO projects (name, color) VALUES (?, ?)').run(name, color);
  const project = db.prepare('SELECT * FROM projects WHERE name = ?').get(name);
  broadcast({ event: 'project:created', data: project });
  res.json(project);
});

app.delete('/api/projects/:name', (req, res) => {
  if (req.params.name === 'General') return res.status(400).json({ error: 'Cannot delete General' });
  db.prepare("UPDATE tasks SET project = 'General' WHERE project = ?").run(req.params.name);
  db.prepare('DELETE FROM projects WHERE name = ?').run(req.params.name);
  broadcast({ event: 'project:deleted', data: { name: req.params.name } });
  res.json({ ok: true });
});

// ─── Stats API ─────────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as c FROM tasks').get().c;
  const done = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE status = 'done'").get().c;
  const urgent = db.prepare("SELECT COUNT(*) as c FROM tasks WHERE priority = 'urgent' AND status != 'done'").get().c;
  const byType = db.prepare("SELECT type, COUNT(*) as count FROM tasks WHERE status != 'done' GROUP BY type").all();
  const recent = db.prepare("SELECT * FROM tasks ORDER BY created_at DESC LIMIT 5").all();
  res.json({ total, done, urgent, byType, recent: recent.map(t => ({ ...t, tags: JSON.parse(t.tags || '[]') })) });
});

// WebSocket connection
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ event: 'connected', data: { message: 'AsTodo server connected' } }));
});

// Get local IP
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

const PORT = 3131;
server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log(`\n🚀 AsTodo Server running!`);
  console.log(`📱 iPhone URL: http://${ip}:${PORT}`);
  console.log(`🖥️  Mac URL:   http://localhost:${PORT}\n`);
});
