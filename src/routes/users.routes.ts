import { Router } from 'express';
import { getUsers, createUser } from '../controllers/users.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticate, getUsers);
router.post('/', authenticate, createUser);

export default router;
