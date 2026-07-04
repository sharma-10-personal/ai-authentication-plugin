import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './config/index.js';
import { connectDb } from './db/index.js';
import router from './routes/index.js';

const app = express();

// Standard middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Main API Routes mount
app.use('/api', router);

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});

// Boot Server
async function start() {
  await connectDb();
  app.listen(config.port, () => {
    console.log(`====================================================`);
    console.log(`🛡️  GUARDRAIL GATEWAY SERVER BOOTED SUCCESSFULLY`);
    console.log(`📡 Listening on: http://localhost:${config.port}`);
    console.log(`⚙️  Env: ${process.env.NODE_ENV || 'development'}`);
    console.log(`====================================================`);
  });
}

start().catch(err => {
  console.error('Critical server startup failure:', err);
});
