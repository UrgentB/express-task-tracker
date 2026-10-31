import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../db.js';
import { requireToken } from '../auth.js';
import { validateTitle, validateRunId, isUuid } from '../validate.js';

const router = Router();
router.use(requireToken);

function rowToTask(row) {
  return {
    id: row.id,
    ownerLogin: row.owner_login,
    title: row.title,
    done: row.done,
    runId: row.run_id,
    createdAt: row.created_at.toISOString(),
  };
}

// GET /api/tasks/?runId=...
router.get('/', async (req, res) => {
  const { runId } = req.query;
  if (!validateRunId(runId)) {
    return res.status(400).json({ error: 'Invalid runId' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT * FROM tasks WHERE owner_login = $1 AND run_id = $2 ORDER BY created_at`,
      [process.env.OWNER_LOGIN, runId]
    );
    res.json(rows.map(rowToTask));
  } catch {
    res.status(503).json({ error: 'Database error' });
  }
});

// POST /api/tasks/
router.post('/', async (req, res) => {
  const body = req.body ?? {};
  const keys = Object.keys(body);

  if (keys.length !== 2 || !keys.includes('title') || !keys.includes('runId')) {
    return res.status(400).json({ error: 'Only title and runId allowed' });
  }

  const title = validateTitle(body.title);
  if (!title) return res.status(400).json({ error: 'Invalid title' });
  if (!validateRunId(body.runId)) return res.status(400).json({ error: 'Invalid runId' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO tasks (id, owner_login, title, done, run_id, created_at)
       VALUES ($1, $2, $3, FALSE, $4, now())
       RETURNING *`,
      [uuidv4(), process.env.OWNER_LOGIN, title, body.runId]
    );
    res.status(201).json(rowToTask(rows[0]));
  } catch {
    res.status(503).json({ error: 'Database error' });
  }
});

// GET /api/tasks/:id/
router.get('/:id', async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid UUID' });

  try {
    const { rows } = await pool.query(
      `SELECT * FROM tasks WHERE id = $1 AND owner_login = $2`,
      [req.params.id, process.env.OWNER_LOGIN]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rowToTask(rows[0]));
  } catch {
    res.status(503).json({ error: 'Database error' });
  }
});

// PATCH /api/tasks/:id/
router.patch('/:id', async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid UUID' });

  const body = req.body ?? {};
  const keys = Object.keys(body);

  if (keys.length === 0) return res.status(400).json({ error: 'Empty patch' });
  if (!keys.every(k => k === 'title' || k === 'done')) {
    return res.status(400).json({ error: 'Only title and/or done allowed' });
  }

  const updates = [];
  const values = [];
  let i = 1;

  if ('title' in body) {
    const title = validateTitle(body.title);
    if (!title) return res.status(400).json({ error: 'Invalid title' });
    updates.push(`title = $${i++}`);
    values.push(title);
  }

  if ('done' in body) {
    if (typeof body.done !== 'boolean') {
      return res.status(400).json({ error: 'done must be boolean' });
    }
    updates.push(`done = $${i++}`);
    values.push(body.done);
  }

  values.push(req.params.id, process.env.OWNER_LOGIN);

  try {
    const { rows } = await pool.query(
      `UPDATE tasks SET ${updates.join(', ')}
       WHERE id = $${i++} AND owner_login = $${i}
       RETURNING *`,
      values
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rowToTask(rows[0]));
  } catch {
    res.status(503).json({ error: 'Database error' });
  }
});

// DELETE /api/tasks/:id/
router.delete('/:id', async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: 'Invalid UUID' });

  try {
    const { rowCount } = await pool.query(
      `DELETE FROM tasks WHERE id = $1 AND owner_login = $2`,
      [req.params.id, process.env.OWNER_LOGIN]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.status(204).end();
  } catch {
    res.status(503).json({ error: 'Database error' });
  }
});

export default router;