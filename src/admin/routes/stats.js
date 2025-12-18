import express from 'express';
import pool from '../../database/pool.js';
import { authMiddleware } from '../../auth/jwt.js';

const router = express.Router();

// Get dashboard statistics
router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    // Total proxies
    const proxiesResult = await pool.query(
      'SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM proxies'
    );

    // Total requests (last 24 hours)
    const requestsResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM proxy_logs
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `);

    // SSL certificates expiring soon (within 30 days)
    const sslResult = await pool.query(`
      SELECT COUNT(*) as expiring_soon
      FROM ssl_certificates
      WHERE expires_at < NOW() + INTERVAL '30 days'
    `);

    // Average response time (last 24 hours)
    const avgResponseTime = await pool.query(`
      SELECT AVG(response_time) as avg_time
      FROM proxy_logs
      WHERE created_at > NOW() - INTERVAL '24 hours'
      AND response_time IS NOT NULL
    `);

    // Error rate (last 24 hours)
    const errorRate = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status_code >= 400) as errors,
        COUNT(*) as total
      FROM proxy_logs
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `);

    res.json({
      success: true,
      stats: {
        proxies: {
          total: parseInt(proxiesResult.rows[0].total),
          active: parseInt(proxiesResult.rows[0].active)
        },
        requests: {
          last24h: parseInt(requestsResult.rows[0].total)
        },
        ssl: {
          expiringSoon: parseInt(sslResult.rows[0].expiring_soon)
        },
        performance: {
          avgResponseTime: parseFloat(avgResponseTime.rows[0].avg_time) || 0,
          errorRate: errorRate.rows[0].total > 0
            ? (errorRate.rows[0].errors / errorRate.rows[0].total * 100).toFixed(2)
            : 0
        }
      }
    });

  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    });
  }
});

// Get proxy logs
router.get('/logs/:proxyId?', authMiddleware, async (req, res) => {
  try {
    const { proxyId } = req.params;
    const { limit = 100, offset = 0 } = req.query;

    let query = `
      SELECT
        pl.*,
        p.domain
      FROM proxy_logs pl
      LEFT JOIN proxies p ON pl.proxy_id = p.id
    `;

    const params = [];
    if (proxyId) {
      query += ' WHERE pl.proxy_id = $1';
      params.push(proxyId);
    }

    query += ` ORDER BY pl.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      logs: result.rows,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    console.error('Get proxy logs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch logs'
    });
  }
});

export default router;
