import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export const uploadToSupabase = async (file: Express.Multer.File): Promise<string> => {
    try {
        // Generate unique filename
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(7);
        const fileExtension = file.originalname.split('.').pop();
        const fileName = `receipt-${timestamp}-${randomString}.${fileExtension}`;

        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
            .from('receipts')
            .upload(fileName, file.buffer, {
                contentType: file.mimetype,
                upsert: false,
            });

        if (error) {
            console.error('Supabase upload error:', error);
            throw new Error(`Failed to upload receipt: ${error.message}`);
        }

        // Get public URL
        const { data: urlData } = supabase.storage
            .from('receipts')
            .getPublicUrl(fileName);

        console.log('Receipt uploaded successfully:', urlData.publicUrl);
        return urlData.publicUrl;
    } catch (error: any) {
        console.error('Upload error:', error);
        throw new Error(`Failed to upload receipt: ${error.message}`);
    }
};

export default supabase;
