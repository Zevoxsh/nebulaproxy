import pool from './pool.js';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

export async function initDatabase() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        is_admin BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create proxies table
    await client.query(`
      CREATE TABLE IF NOT EXISTS proxies (
        id SERIAL PRIMARY KEY,
        domain VARCHAR(255) UNIQUE NOT NULL,
        backend_url VARCHAR(500) NOT NULL,
        backend_port INTEGER NOT NULL,
        proxy_type VARCHAR(50) DEFAULT 'http',
        description TEXT,
        ssl_enabled BOOLEAN DEFAULT false,
        ssl_cert TEXT,
        ssl_key TEXT,
        ssl_ca TEXT,
        is_active BOOLEAN DEFAULT true,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create SSL certificates table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ssl_certificates (
        id SERIAL PRIMARY KEY,
        domain VARCHAR(255) UNIQUE NOT NULL,
        certificate TEXT NOT NULL,
        private_key TEXT NOT NULL,
        chain TEXT,
        expires_at TIMESTAMP NOT NULL,
        issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        auto_renew BOOLEAN DEFAULT true,
        last_renewal_attempt TIMESTAMP,
        renewal_status VARCHAR(50)
      )
    `);

    // Create proxy logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS proxy_logs (
        id SERIAL PRIMARY KEY,
        proxy_id INTEGER REFERENCES proxies(id) ON DELETE CASCADE,
        request_method VARCHAR(10),
        request_path TEXT,
        client_ip VARCHAR(45),
        status_code INTEGER,
        response_time INTEGER,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create sessions table for additional security
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(255) NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_proxies_domain ON proxies(domain);
      CREATE INDEX IF NOT EXISTS idx_proxies_active ON proxies(is_active);
      CREATE INDEX IF NOT EXISTS idx_ssl_domain ON ssl_certificates(domain);
      CREATE INDEX IF NOT EXISTS idx_logs_proxy ON proxy_logs(proxy_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    `);

    // Create admin user if not exists
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    const existingAdmin = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [adminEmail]
    );

    if (existingAdmin.rows.length === 0) {
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      await client.query(
        'INSERT INTO users (email, password, is_admin) VALUES ($1, $2, $3)',
        [adminEmail, hashedPassword, true]
      );
      console.log(`✅ Admin user created: ${adminEmail}`);
    }

    await client.query('COMMIT');
    console.log('✅ Database tables initialized successfully');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Database initialization failed:', error);
    throw error;
  } finally {
    client.release();
  }
}
