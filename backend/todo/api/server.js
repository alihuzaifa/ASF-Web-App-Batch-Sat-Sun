const express = require('express');

const app = express();
app.use(express.json());

// CORS: this is a public demo API, so any origin may call it.
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const PORT = process.env.PORT || 3000;

// In-memory store
let todos = [];
let nextId = 1;

const findTodo = (id) => todos.find((t) => t.id === Number(id));

// CREATE
app.post('/todos', (req, res) => {
  const { title, completed = false } = req.body || {};

  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required and must be a non-empty string' });
  }
  if (typeof completed !== 'boolean') {
    return res.status(400).json({ error: 'completed must be a boolean' });
  }

  const todo = {
    id: nextId++,
    title: title.trim(),
    completed,
  };
  todos.push(todo);
  res.status(201).json(todo);
});

// READ all (optional ?completed=true|false)
app.get('/todos', (req, res) => {
  const { completed } = req.query;
  if (completed === undefined) return res.json(todos);

  if (completed !== 'true' && completed !== 'false') {
    return res.status(400).json({ error: 'completed filter must be "true" or "false"' });
  }
  res.json(todos.filter((t) => t.completed === (completed === 'true')));
});

// READ one
app.get('/todos/:id', (req, res) => {
  const todo = findTodo(req.params.id);
  if (!todo) return res.status(404).json({ error: 'todo not found' });
  res.json(todo);
});

// UPDATE (partial)
app.put('/todos/:id', (req, res) => {
  const todo = findTodo(req.params.id);
  if (!todo) return res.status(404).json({ error: 'todo not found' });

  const { title, completed } = req.body || {};

  if (title !== undefined) {
    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'title must be a non-empty string' });
    }
    todo.title = title.trim();
  }
  if (completed !== undefined) {
    if (typeof completed !== 'boolean') {
      return res.status(400).json({ error: 'completed must be a boolean' });
    }
    todo.completed = completed;
  }

  res.json(todo);
});

// DELETE
app.delete('/todos/:id', (req, res) => {
  const index = todos.findIndex((t) => t.id === Number(req.params.id));
  if (index === -1) return res.status(404).json({ error: 'todo not found' });

  const [deleted] = todos.splice(index, 1);
  res.json(deleted);
});

app.use((req, res) => res.status(404).json({ error: 'route not found' }));

// JSON body parse errors
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'invalid JSON body' });
  }
  console.error(err);
  res.status(500).json({ error: 'internal server error' });
});

// Run a real server locally; on Vercel the app is used as a serverless handler.
if (require.main === module) {
  app.listen(PORT, () => console.log(`Todo API listening on http://localhost:${PORT}`));
}

module.exports = app;
