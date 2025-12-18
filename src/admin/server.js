import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import https from 'https';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import authRoutes from './routes/auth.js';
import proxyRoutes from './routes/proxies.js';
import sslRoutes from './routes/ssl.js';
import statsRoutes from './routes/stats.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for development, enable in production
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

app.use('/api/', limiter);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/proxies', proxyRoutes);
app.use('/api/ssl', sslRoutes);
app.use('/api/stats', statsRoutes);

// Serve frontend
app.use(express.static(path.join(__dirname, '../../public')));

// SPA fallback
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../../public/index.html'));
  } else {
    res.status(404).json({ success: false, error: 'API endpoint not found' });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  });
});

export async function startAdminServer() {
  const port = process.env.PORT || 3000;

  return new Promise((resolve) => {
    app.listen(port, () => {
      console.log(`✅ Admin server running on port ${port}`);
      resolve();
    });
  });
}
