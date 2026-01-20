import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
    createNewTransporter,
    updateExistingTransporter,
    getTransporters,
    getTransporter,
    toggleStatus,
} from '../controllers/transporters.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Create transporter (Admin only)
router.post('/', createNewTransporter);

// Get all transporters (with optional activeOnly filter)
router.get('/', getTransporters);

// Get transporter by ID
router.get('/:id', getTransporter);

// Update transporter (Admin only)
router.put('/:id', updateExistingTransporter);

// Toggle transporter status (Admin only)
router.patch('/:id/toggle-status', toggleStatus);

export default router;
