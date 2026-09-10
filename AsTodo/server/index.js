const express = require('express');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const path = require('path');
const http = require('http');
const os = require('os');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const DB_PATH = path.join(os.homedir(), '.astodo.json');

function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) return defaultDB();
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    data.tasks = (data.tasks || []).map(t => ({
      subtasks: [], due_date: null, reminder: null, recur: null, order: 0, importance: 8, ...t
    }));
    return data;
  } catch { return defaultDB(); }
}

function defaultDB() {
  return {
    tasks: [],
    projects: [{ id: 1, name: 'General', color: '#6366f1', created_at: new Date().toISOString() }],
    activity: {},
    nextTaskId: 1,
    nextProjectId: 2
  };
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

if (!fs.existsSync(DB_PATH)) writeDB(readDB());

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
}

function recordActivity(db) {
  const today = new Date().toISOString().split('T')[0];
  db.activity = db.activity || {};
  db.activity[today] = (db.activity[today] || 0) + 1;
}

const IMPORTANCE_BY_PRIORITY = { urgent: 18, high: 13, medium: 8, low: 3 };
function clampImportance(v, fallbackPriority) {
  const n = parseInt(v, 10);
  if (!isNaN(n) && n >= 1 && n <= 20) return n;
  return IMPORTANCE_BY_PRIORITY[fallbackPriority] || 8;
}

// ── Tasks ──────────────────────────────────────────────────────
app.get('/api/tasks', (req, res) => {
  const db = readDB();
  const { project, type, status, priority, search } = req.query;
  let tasks = [...db.tasks];
  if (project) tasks = tasks.filter(t => t.project === project);
  if (type) tasks = tasks.filter(t => t.type === type);
  if (status) tasks = tasks.filter(t => t.status === status);
  if (priority) tasks = tasks.filter(t => t.priority === priority);
  if (search) tasks = tasks.filter(t =>
    t.title.toLowerCase().includes(search.toLowerCase()) ||
    (t.description || '').toLowerCase().includes(search.toLowerCase())
  );
  tasks.sort((a, b) => (a.order || 0) - (b.order || 0) || new Date(b.created_at) - new Date(a.created_at));
  res.json(tasks);
});

app.post('/api/tasks', (req, res) => {
  const db = readDB();
  const task = {
    id: db.nextTaskId++,
    title: req.body.title,
    description: req.body.description || '',
    type: req.body.type || 'note',
    priority: req.body.priority || 'medium',
    status: req.body.status || 'todo',
    project: req.body.project || 'General',
    tags: req.body.tags || [],
    ai_suggestion: req.body.ai_suggestion || '',
    subtasks: req.body.subtasks || [],
    due_date: req.body.due_date || null,
    reminder: req.body.reminder || null,
    recur: req.body.recur || null,
    order: db.tasks.length,
    importance: clampImportance(req.body.importance, req.body.priority || 'medium'),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null
  };
  db.tasks.unshift(task);
  writeDB(db);
  broadcast({ event: 'task:created', data: task });
  res.json(task);
});

app.put('/api/tasks/:id', (req, res) => {
  const db = readDB();
  const id = parseInt(req.params.id);
  const idx = db.tasks.findIndex(t => t.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const task = db.tasks[idx];
  const fields = ['title','description','type','priority','status','project','tags','ai_suggestion','subtasks','due_date','reminder','recur','order','importance'];
  fields.forEach(f => {
    if (req.body[f] !== undefined) {
      task[f] = f === 'importance' ? clampImportance(req.body[f], req.body.priority || task.priority) : req.body[f];
    }
  });
  task.updated_at = new Date().toISOString();
  if (req.body.status === 'done' && !task.completed_at) {
    task.completed_at = new Date().toISOString();
    recordActivity(db);
    // handle recurrence
    if (task.recur) {
      const newTask = { ...task, id: db.nextTaskId++, status: 'todo', completed_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      const d = new Date(task.due_date || new Date());
      if (task.recur === 'daily') d.setDate(d.getDate() + 1);
      if (task.recur === 'weekly') d.setDate(d.getDate() + 7);
      if (task.recur === 'monthly') d.setMonth(d.getMonth() + 1);
      newTask.due_date = d.toISOString();
      db.tasks.unshift(newTask);
      broadcast({ event: 'task:created', data: newTask });
    }
  }
  if (req.body.status && req.body.status !== 'done') task.completed_at = null;
  db.tasks[idx] = task;
  writeDB(db);
  broadcast({ event: 'task:updated', data: task });
  res.json(task);
});

app.delete('/api/tasks/:id', (req, res) => {
  const db = readDB();
  db.tasks = db.tasks.filter(t => t.id !== parseInt(req.params.id));
  writeDB(db);
  broadcast({ event: 'task:deleted', data: { id: parseInt(req.params.id) } });
  res.json({ ok: true });
});

// reorder
app.post('/api/tasks/reorder', (req, res) => {
  const db = readDB();
  const { ids } = req.body;
  ids.forEach((id, i) => {
    const t = db.tasks.find(t => t.id === id);
    if (t) t.order = i;
  });
  writeDB(db);
  broadcast({ event: 'tasks:reordered', data: { ids } });
  res.json({ ok: true });
});

// ── Projects ───────────────────────────────────────────────────
app.get('/api/projects', (req, res) => {
  const db = readDB();
  res.json(db.projects.map(p => ({
    ...p,
    task_count: db.tasks.filter(t => t.project === p.name && t.status !== 'done').length
  })));
});

app.post('/api/projects', (req, res) => {
  const db = readDB();
  const { name, color = '#6366f1' } = req.body;
  if (db.projects.find(p => p.name === name)) return res.json(db.projects.find(p => p.name === name));
  const project = { id: db.nextProjectId++, name, color, created_at: new Date().toISOString() };
  db.projects.push(project);
  writeDB(db);
  broadcast({ event: 'project:created', data: project });
  res.json(project);
});

app.delete('/api/projects/:name', (req, res) => {
  const db = readDB();
  if (req.params.name === 'General') return res.status(400).json({ error: 'Cannot delete General' });
  db.tasks.forEach(t => { if (t.project === req.params.name) t.project = 'General'; });
  db.projects = db.projects.filter(p => p.name !== req.params.name);
  writeDB(db);
  broadcast({ event: 'project:deleted', data: { name: req.params.name } });
  res.json({ ok: true });
});

// ── Stats + Activity ───────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  const db = readDB();
  const tasks = db.tasks;
  const total = tasks.length;
  const done = tasks.filter(t => t.status === 'done').length;
  const urgent = tasks.filter(t => t.priority === 'urgent' && t.status !== 'done').length;
  const overdue = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done').length;

  // last 14 days activity
  const activity = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    activity.push({ date: key, count: db.activity?.[key] || 0 });
  }

  // streak
  let streak = 0;
  const today = new Date().toISOString().split('T')[0];
  let check = new Date();
  while (true) {
    const key = check.toISOString().split('T')[0];
    if (db.activity?.[key] > 0) { streak++; check.setDate(check.getDate() - 1); }
    else break;
    if (streak > 365) break;
  }

  // by type
  const byType = ['feature','bug','note','improve'].map(type => ({
    type, count: tasks.filter(t => t.type === type && t.status !== 'done').length
  }));

  res.json({ total, done, urgent, overdue, activity, streak, byType });
});

// ── Export ─────────────────────────────────────────────────────
app.get('/api/export/json', (req, res) => {
  const db = readDB();
  res.setHeader('Content-Disposition', 'attachment; filename=astodo-export.json');
  res.json(db.tasks);
});

app.get('/api/export/markdown', (req, res) => {
  const db = readDB();
  const lines = ['# AsTodo Export\n', `Generated: ${new Date().toLocaleDateString()}\n`];
  const groups = {};
  db.tasks.forEach(t => {
    if (!groups[t.project]) groups[t.project] = [];
    groups[t.project].push(t);
  });
  Object.entries(groups).forEach(([proj, tasks]) => {
    lines.push(`\n## ${proj}\n`);
    tasks.forEach(t => {
      const check = t.status === 'done' ? '[x]' : '[ ]';
      lines.push(`- ${check} **${t.title}** \`${t.type}\` \`${t.priority}\``);
      if (t.description) lines.push(`  > ${t.description}`);
      if (t.due_date) lines.push(`  📅 Due: ${new Date(t.due_date).toLocaleDateString()}`);
      (t.subtasks || []).forEach(s => lines.push(`  - ${s.done ? '[x]' : '[ ]'} ${s.title}`));
    });
  });
  res.setHeader('Content-Disposition', 'attachment; filename=astodo-export.md');
  res.setHeader('Content-Type', 'text/markdown');
  res.send(lines.join('\n'));
});

wss.on('connection', ws => {
  ws.send(JSON.stringify({ event: 'connected' }));
});

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets))
    for (const net of nets[name])
      if (net.family === 'IPv4' && !net.internal) return net.address;
  return 'localhost';
}

const PORT = 3131;
server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log(`\n✦ AsTodo Server running!\n`);
  console.log(`📱 iPhone: http://${ip}:${PORT}`);
  console.log(`🖥️  Mac:    http://localhost:${PORT}\n`);
});