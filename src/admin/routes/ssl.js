import express from 'express';
import pool from '../../database/pool.js';
import { authMiddleware } from '../../auth/jwt.js';
import { requestCertificate, renewCertificate } from '../../ssl/manager.js';

const router = express.Router();

// Get all SSL certificates
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id, domain, expires_at, issued_at, auto_renew,
        last_renewal_attempt, renewal_status
      FROM ssl_certificates
      ORDER BY expires_at ASC
    `);

    res.json({
      success: true,
      certificates: result.rows
    });

  } catch (error) {
    console.error('Get SSL certificates error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch SSL certificates'
    });
  }
});

// Request new SSL certificate
router.post('/request/:domain', authMiddleware, async (req, res) => {
  try {
    const { domain } = req.params;

    const result = await requestCertificate(domain);

    res.json({
      success: true,
      message: 'SSL certificate requested successfully',
      certificate: result
    });

  } catch (error) {
    console.error('Request SSL certificate error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to request SSL certificate'
    });
  }
});

// Renew SSL certificate
router.post('/renew/:domain', authMiddleware, async (req, res) => {
  try {
    const { domain } = req.params;

    const result = await renewCertificate(domain);

    res.json({
      success: true,
      message: 'SSL certificate renewed successfully',
      certificate: result
    });

  } catch (error) {
    console.error('Renew SSL certificate error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to renew SSL certificate'
    });
  }
});

export default router;
