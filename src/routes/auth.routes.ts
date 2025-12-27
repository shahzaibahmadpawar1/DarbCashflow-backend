import { Router } from 'express';
import { register, login, getMe } from '../controllers/auth.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

router.post('/register', authenticate, authorize('Admin'), register);
router.post('/login', login);
router.get('/me', authenticate, getMe);

export default router;

