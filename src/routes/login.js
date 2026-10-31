import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  res.type('text/plain').send(process.env.OWNER_LOGIN);
});

export default router;