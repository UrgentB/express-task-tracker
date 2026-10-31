import { Router } from 'express';
import { requireToken } from '../auth.js';

const router = Router();

router.get('/', requireToken, (req, res) => {
  res.json({
    login: process.env.OWNER_LOGIN,
    fullName: process.env.OWNER_FULLNAME,
  });
});

export default router;