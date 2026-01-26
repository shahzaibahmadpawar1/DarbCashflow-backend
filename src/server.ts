import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import cashRoutes from './routes/cash.routes';
import inventoryRoutes from './routes/inventory.routes';
import stationsRoutes from './routes/stations.routes';
import shiftsRoutes from './routes/shifts.routes';
import usersRoutes from './routes/users.routes';
import fuelRoutes from './routes/fuel.routes';
import uploadRoutes from './routes/upload.routes';
import officeUserRoutes from './routes/officeUser.routes';
import nozzleRoutes from './routes/nozzle.routes';
import fuelInventoryRoutes from './routes/fuelInventory.routes';
import purchaseRequestRoutes from './routes/purchaseRequest.routes';
import purchaseOrderRoutes from './routes/purchaseOrder.routes';
import creditTransactionsRoutes from './routes/creditTransactions.routes';
import fuelBuyingRatesRoutes from './routes/fuelBuyingRates.routes';
import transportersRoutes from './routes/transporters.routes';
import procurementRoutes from './routes/procurement.routes';

dotenv.config();

const app = express();


app.use(
  cors({
    origin: [
      "https://azharalibuttar.com",      // Production (cPanel)
      "https://www.azharalibuttar.com",  // Production (www)
      "https://fms.darbstations.com.sa",
      "http://localhost:3000",           // Local Development (Vite default port)
      "http://localhost:5173"            // Alternate Local Port (just in case)
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 86400 // 24 hours
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
app.use('/api/fuel', fuelRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/office-users', officeUserRoutes);
app.use('/api/nozzles', nozzleRoutes);
app.use('/api/fuel-inventory', fuelInventoryRoutes);
app.use('/api/purchase-requests', purchaseRequestRoutes);
app.use('/api/purchase-orders', purchaseOrderRoutes);
app.use('/api/credit-transactions', creditTransactionsRoutes);
app.use('/api/fuel-buying-rates', fuelBuyingRatesRoutes);
app.use('/api/transporters', transportersRoutes);
app.use('/api/procurement', procurementRoutes);


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

