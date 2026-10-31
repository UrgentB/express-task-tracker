import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import loginRouter from './routes/login.js';
import authorRouter from './routes/author.js';
import tasksRouter from './routes/tasks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/login/', loginRouter);
app.use('/api/author/', authorRouter);
app.use('/api/tasks/', tasksRouter);

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  next(err);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Listening on ${port}`));