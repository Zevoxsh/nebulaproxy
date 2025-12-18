import dotenv from 'dotenv';
import { initDatabase } from './database/init.js';
import { startAdminServer } from './admin/server.js';
import { startProxyServer } from './proxy/server.js';
import { loadProxies } from './proxy/loader.js';

dotenv.config();

async function start() {
  try {
    console.log('🚀 Starting Nebula Proxy Server...');

    // Initialize database and create tables
    console.log('📦 Initializing database...');
    await initDatabase();

    // Start admin API server
    console.log('🔧 Starting admin server...');
    await startAdminServer();

    // Load existing proxies from database
    console.log('🔄 Loading proxy configurations...');
    await loadProxies();

    // Start proxy server
    console.log('🌐 Starting proxy server...');
    await startProxyServer();

    console.log('✅ Nebula Proxy Server started successfully!');
    console.log(`📊 Admin Panel: http://localhost:${process.env.PORT || 3000}`);
    console.log('🌍 Proxy listening on ports 80 (HTTP) and 443 (HTTPS)');

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

start();
