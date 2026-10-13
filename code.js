'use strict';

const express = require('express');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 5000;
const startedAt = Date.now();

// ---------- Middleware ----------
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Request logger
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`);
  });
  next();
});

// ---------- In-memory store ----------
const PRIORITIES = ['low', 'medium', 'high'];
const tasks = new Map();
const stats = { requests: 0, created: 0, deleted: 0 };

function seed() {
  [
    { title: 'Setup Jenkins pipeline', priority: 'high', done: true },
    { title: 'Build Docker image', priority: 'high', done: true },
    { title: 'Push image to Docker Hub', priority: 'medium', done: false },
    { title: 'Deploy to Kubernetes (minikube)', priority: 'medium', done: false },
  ].forEach((t) => createTask(t));
}

function createTask({ title, priority = 'medium', done = false }) {
  const task = {
    id: crypto.randomUUID(),
    title: String(title).trim(),
    priority,
    done: Boolean(done),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  tasks.set(task.id, task);
  stats.created++;
  return task;
}

function validate(body, partial = false) {
  const errors = [];
  if (!partial || body.title !== undefined) {
    if (typeof body.title !== 'string' || body.title.trim().length < 1 || body.title.length > 120) {
      errors.push('title must be a string between 1 and 120 characters');
    }
  }
  if (body.priority !== undefined && !PRIORITIES.includes(body.priority)) {
    errors.push(`priority must be one of: ${PRIORITIES.join(', ')}`);
  }
  if (body.done !== undefined && typeof body.done !== 'boolean') {
    errors.push('done must be a boolean');
  }
  return errors;
}

app.use((req, res, next) => { stats.requests++; next(); });

// ---------- Routes ----------
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    node: process.version,
    memoryMB: Math.round(process.memoryUsage().rss / 1048576),
    hostname: require('os').hostname(),
  });
});

app.get('/api/stats', (req, res) => {
  const all = [...tasks.values()];
  res.json({
    total: all.length,
    done: all.filter((t) => t.done).length,
    pending: all.filter((t) => !t.done).length,
    byPriority: PRIORITIES.reduce((acc, p) => ({ ...acc, [p]: all.filter((t) => t.priority === p).length }), {}),
    ...stats,
  });
});

// List with filter / search / sort / pagination
app.get('/api/tasks', (req, res) => {
  const { done, priority, q, sort = 'createdAt', order = 'desc', page = 1, limit = 50 } = req.query;
  let list = [...tasks.values()];

  if (done !== undefined) list = list.filter((t) => t.done === (done === 'true'));
  if (priority) list = list.filter((t) => t.priority === priority);
  if (q) list = list.filter((t) => t.title.toLowerCase().includes(String(q).toLowerCase()));

  const dir = order === 'asc' ? 1 : -1;
  list.sort((a, b) => (a[sort] > b[sort] ? dir : a[sort] < b[sort] ? -dir : 0));

  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  res.json({ total: list.length, page: p, limit: l, data: list.slice((p - 1) * l, p * l) });
});

app.get('/api/tasks/:id', (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

app.post('/api/tasks', (req, res) => {
  const errors = validate(req.body);
  if (errors.length) return res.status(400).json({ errors });
  res.status(201).json(createTask(req.body));
});

app.patch('/api/tasks/:id', (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  const errors = validate(req.body, true);
  if (errors.length) return res.status(400).json({ errors });

  const { title, priority, done } = req.body;
  if (title !== undefined) task.title = title.trim();
  if (priority !== undefined) task.priority = priority;
  if (done !== undefined) task.done = done;
  task.updatedAt = new Date().toISOString();
  res.json(task);
});

app.delete('/api/tasks/:id', (req, res) => {
  if (!tasks.delete(req.params.id)) return res.status(404).json({ error: 'Task not found' });
  stats.deleted++;
  res.status(204).end();
});

// ---------- Errors ----------
app.use('/api', (req, res) => res.status(404).json({ error: 'Route not found' }));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// ---------- Start / graceful shutdown ----------
seed();
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));