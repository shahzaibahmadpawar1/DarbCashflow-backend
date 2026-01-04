import { Request, Response } from 'express';
import { uploadToSupabase } from '../utils/supabase-storage';

/**
 * Upload receipt image
 */
export const uploadReceipt = async (req: Request, res: Response) => {
    try {
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Upload to Supabase storage
        const receiptUrl = await uploadToSupabase(file);

        res.json({
            message: 'Receipt uploaded successfully',
            url: receiptUrl
        });
    } catch (error: any) {
        console.error('Upload receipt error:', error);
        res.status(500).json({ error: error.message || 'Failed to upload receipt' });
    }
};
