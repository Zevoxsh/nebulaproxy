import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import tls from 'tls';
import pool from '../database/pool.js';
import { findProxyConfig } from '../proxy/loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store SSL contexts in memory
const sslContexts = new Map();

// Certificate storage directory
const CERT_DIR = path.join(process.cwd(), 'ssl-certificates');

// Ensure certificate directory exists
try {
  await fs.mkdir(CERT_DIR, { recursive: true });
} catch (error) {
  console.error('Failed to create certificate directory:', error);
}

export async function getCertificate(domain) {
  // Check memory cache
  if (sslContexts.has(domain)) {
    return sslContexts.get(domain);
  }

  // Check wildcard match
  const parts = domain.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const baseDomain = parts.slice(i).join('.');
    const wildcardDomain = `*.${baseDomain}`;
    if (sslContexts.has(wildcardDomain)) {
      return sslContexts.get(wildcardDomain);
    }
  }

  // Try to load from database
  try {
    const result = await pool.query(
      'SELECT certificate, private_key, chain FROM ssl_certificates WHERE domain = $1',
      [domain]
    );

    if (result.rows.length > 0) {
      const cert = result.rows[0];
      const context = tls.createSecureContext({
        cert: cert.certificate,
        key: cert.private_key,
        ca: cert.chain
      });

      const certData = {
        context,
        cert: cert.certificate,
        key: cert.private_key,
        ca: cert.chain
      };

      sslContexts.set(domain, certData);
      return certData;
    }

    // Try to request certificate automatically if domain has proxy config
    const proxyConfig = findProxyConfig(domain);
    if (proxyConfig && proxyConfig.sslEnabled) {
      console.log(`🔐 Attempting to request SSL certificate for ${domain}...`);
      try {
        const newCert = await requestCertificate(domain);
        if (newCert) {
          console.log(`✅ Certificate generated and loaded for ${domain}`);
          return newCert;
        }
      } catch (certError) {
        console.error(`Failed to generate certificate for ${domain}:`, certError);
      }
    }

  } catch (error) {
    console.error(`Failed to load certificate for ${domain}:`, error);
  }

  console.warn(`⚠️  No certificate available for ${domain}`);
  return null;
}

export async function requestCertificate(domain) {
  try {
    console.log(`🔐 Requesting SSL certificate for ${domain}...`);

    // This is a placeholder for Let's Encrypt integration
    // In production, you would use a library like greenlock or acme-client
    // For now, we'll create a self-signed certificate for development

    const selfsigned = await generateSelfSignedCertificate(domain);

    // Store in database
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    await pool.query(`
      INSERT INTO ssl_certificates (
        domain, certificate, private_key, chain, expires_at, auto_renew
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (domain) DO UPDATE SET
        certificate = EXCLUDED.certificate,
        private_key = EXCLUDED.private_key,
        chain = EXCLUDED.chain,
        expires_at = EXCLUDED.expires_at,
        issued_at = CURRENT_TIMESTAMP
    `, [
      domain,
      selfsigned.cert,
      selfsigned.key,
      selfsigned.ca || null,
      expiresAt,
      true
    ]);

    // Create SSL context
    const context = tls.createSecureContext({
      cert: selfsigned.cert,
      key: selfsigned.key,
      ca: selfsigned.ca
    });

    const certData = {
      context,
      cert: selfsigned.cert,
      key: selfsigned.key,
      ca: selfsigned.ca
    };

    sslContexts.set(domain, certData);

    console.log(`✅ SSL certificate generated for ${domain}`);

    return certData;

  } catch (error) {
    console.error(`❌ Failed to request certificate for ${domain}:`, error);
    throw error;
  }
}

export async function renewCertificate(domain) {
  // For now, just re-request the certificate
  return await requestCertificate(domain);
}

// Helper function to generate self-signed certificate
async function generateSelfSignedCertificate(domain) {
  // This is a simplified version for development
  // In production, you would integrate with Let's Encrypt using acme-client or greenlock

  const { execSync } = await import('child_process');
  const certPath = path.join(CERT_DIR, `${domain}.crt`);
  const keyPath = path.join(CERT_DIR, `${domain}.key`);

  try {
    console.log(`🔧 Generating self-signed certificate for ${domain} using OpenSSL...`);
    // Generate self-signed certificate using openssl
    execSync(`openssl req -x509 -newkey rsa:4096 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/CN=${domain}"`, {
      stdio: 'pipe'
    });

    const cert = await fs.readFile(certPath, 'utf8');
    const key = await fs.readFile(keyPath, 'utf8');

    console.log(`✅ OpenSSL certificate generated successfully for ${domain}`);
    return { cert, key, ca: null };

  } catch (error) {
    // If OpenSSL is not available, return a dummy certificate
    console.error('❌ OpenSSL error:', error.message);
    console.warn('⚠️  OpenSSL not available. This will cause SSL connections to fail.');
    console.warn('⚠️  Please install OpenSSL or use the admin panel to upload a valid certificate.');

    throw new Error('OpenSSL not available and no valid certificate could be generated');
  }
}

// Automatic renewal check (runs daily)
setInterval(async () => {
  try {
    const result = await pool.query(`
      SELECT domain FROM ssl_certificates
      WHERE expires_at < NOW() + INTERVAL '30 days'
      AND auto_renew = true
    `);

    for (const row of result.rows) {
      console.log(`🔄 Auto-renewing certificate for ${row.domain}...`);
      await renewCertificate(row.domain);
    }
  } catch (error) {
    console.error('Auto-renewal check failed:', error);
  }
}, 24 * 60 * 60 * 1000); // Check daily
