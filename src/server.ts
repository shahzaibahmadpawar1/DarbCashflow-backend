import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import cashRoutes from './routes/cash.routes';
import inventoryRoutes from './routes/inventory.routes';
import stationsRoutes from './routes/stations.routes';
import shiftsRoutes from './routes/shifts.routes';
import usersRoutes from './routes/users.routes';

dotenv.config();

const app = express();

// CORS configuration - TEMPORARY: Allow all origins for debugging
app.use(
  cors({
    origin: true, // Allow ANY origin temporarily to test
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/cash', cashRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/stations', stationsRoutes);
app.use('/api/shifts', shiftsRoutes);
app.use('/api/users', usersRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Petroleum Station Management System API' });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// For Vercel serverless, export the handler
// For local development, start the server
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;

