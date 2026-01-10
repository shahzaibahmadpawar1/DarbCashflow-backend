import { Router } from 'express';
import { getUsers, createUser, updateUser, deleteUser, updateUserPassword } from '../controllers/users.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticate, getUsers);
router.post('/', authenticate, createUser);
router.patch('/:id', authenticate, updateUser);
router.patch('/:id/password', authenticate, updateUserPassword);
router.delete('/:id', authenticate, deleteUser);

export default router;
