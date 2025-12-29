import { Router } from 'express';
import { getUsers, createUser, updateUser } from '../controllers/users.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticate, getUsers);
router.post('/', authenticate, createUser);
router.patch('/:id', authenticate, updateUser);

export default router;
