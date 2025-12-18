import express from 'express';
import { body, validationResult } from 'express-validator';
import pool from '../../database/pool.js';
import { authMiddleware } from '../../auth/jwt.js';
import { reloadProxy, removeProxy } from '../../proxy/loader.js';

const router = express.Router();

// Get all proxies
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        p.*,
        u.email as created_by_email,
        COUNT(pl.id) as total_requests
      FROM proxies p
      LEFT JOIN users u ON p.created_by = u.id
      LEFT JOIN proxy_logs pl ON p.id = pl.proxy_id
      GROUP BY p.id, u.email
      ORDER BY p.created_at DESC
    `);

    res.json({
      success: true,
      proxies: result.rows
    });

  } catch (error) {
    console.error('Get proxies error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch proxies'
    });
  }
});

// Get single proxy
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT * FROM proxies WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Proxy not found'
      });
    }

    res.json({
      success: true,
      proxy: result.rows[0]
    });

  } catch (error) {
    console.error('Get proxy error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch proxy'
    });
  }
});

// Create proxy
router.post('/',
  authMiddleware,
  body('domain').notEmpty().trim(),
  body('backend_url').notEmpty().trim(),
  body('backend_port').optional().isInt({ min: 1, max: 65535 }),
  body('proxy_type').optional().isIn(['http', 'https', 'tcp']),
  body('ssl_enabled').optional().isBoolean(),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      let {
        domain,
        backend_url,
        backend_port,
        proxy_type = 'http',
        description = '',
        ssl_enabled = false
      } = req.body;

      // Auto-detect port from backend_url if not provided
      if (!backend_port && backend_url) {
        try {
          if (backend_url.startsWith('http://') || backend_url.startsWith('https://')) {
            const urlObj = new URL(backend_url);
            if (urlObj.port) {
              backend_port = parseInt(urlObj.port);
            } else {
              backend_port = urlObj.protocol === 'https:' ? 443 : 80;
            }
          }
        } catch (e) {
          // If parsing fails, backend_port is required
          return res.status(400).json({
            success: false,
            error: 'Invalid backend URL or missing port'
          });
        }
      }

      // Check if domain already exists
      const existing = await pool.query(
        'SELECT id FROM proxies WHERE domain = $1',
        [domain]
      );

      if (existing.rows.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Domain already exists'
        });
      }

      // Create proxy
      const result = await pool.query(`
        INSERT INTO proxies (
          domain, backend_url, backend_port, proxy_type,
          description, ssl_enabled, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        domain,
        backend_url,
        backend_port,
        proxy_type,
        description,
        ssl_enabled,
        req.user.userId
      ]);

      const proxy = result.rows[0];

      // Reload proxy configuration
      await reloadProxy(proxy);

      res.status(201).json({
        success: true,
        proxy
      });

    } catch (error) {
      console.error('Create proxy error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create proxy'
      });
    }
  }
);

// Update proxy
router.put('/:id',
  authMiddleware,
  body('backend_url').optional().notEmpty().trim(),
  body('backend_port').optional().isInt({ min: 1, max: 65535 }),
  body('proxy_type').optional().isIn(['http', 'https', 'tcp']),
  body('ssl_enabled').optional().isBoolean(),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { id } = req.params;
      const updates = req.body;

      // Build dynamic update query
      const fields = [];
      const values = [];
      let paramCount = 1;

      Object.keys(updates).forEach(key => {
        if (['backend_url', 'backend_port', 'proxy_type', 'description', 'ssl_enabled', 'is_active'].includes(key)) {
          fields.push(`${key} = $${paramCount}`);
          values.push(updates[key]);
          paramCount++;
        }
      });

      if (fields.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No valid fields to update'
        });
      }

      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);

      const result = await pool.query(`
        UPDATE proxies
        SET ${fields.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *
      `, values);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Proxy not found'
        });
      }

      const proxy = result.rows[0];

      // Reload proxy configuration
      await reloadProxy(proxy);

      res.json({
        success: true,
        proxy
      });

    } catch (error) {
      console.error('Update proxy error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update proxy'
      });
    }
  }
);

// Delete proxy
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM proxies WHERE id = $1 RETURNING domain',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Proxy not found'
      });
    }

    // Remove proxy from active configuration
    await removeProxy(result.rows[0].domain);

    res.json({
      success: true,
      message: 'Proxy deleted successfully'
    });

  } catch (error) {
    console.error('Delete proxy error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete proxy'
    });
  }
});

export default router;
