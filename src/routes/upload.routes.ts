import { Router } from 'express';
import { uploadReceipt } from '../controllers/upload.controller';
import { authenticate } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';

const router = Router();

// Upload receipt image
router.post('/receipt', authenticate, upload.single('receipt'), uploadReceipt);

export default router;
