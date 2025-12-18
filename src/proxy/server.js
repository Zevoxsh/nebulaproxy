import http from 'http';
import https from 'https';
import httpProxy from 'http-proxy';
import { findProxyConfig } from './loader.js';
import { getCertificate } from '../ssl/manager.js';
import pool from '../database/pool.js';

// Disable SSL certificate verification globally (for backend connections)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Create global HTTPS agent that accepts self-signed certificates
const globalHttpsAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 200,
  maxFreeSockets: 20,
  timeout: 30000,
  freeSocketTimeout: 15000,
  scheduling: 'fifo'
});

// Create global HTTP agent for connection pooling
const globalHttpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 200,
  maxFreeSockets: 20,
  timeout: 30000,
  freeSocketTimeout: 15000,
  scheduling: 'fifo'
});

const proxy = httpProxy.createProxyServer({
  xfwd: true,
  secure: false, // Don't verify SSL certificates
  changeOrigin: true,
  timeout: 30000, // 30 seconds timeout
  proxyTimeout: 30000
});

// Error handling
proxy.on('error', async (err, req, res) => {
  if (process.env.NODE_ENV === 'development') {
    console.error('❌ Proxy error:', err.message, 'Code:', err.code);
  }

  // Log error asynchronously (fire and forget)
  const proxyConfig = findProxyConfig(req.headers.host);
  if (proxyConfig) {
    pool.query(`
      INSERT INTO proxy_logs (
        proxy_id, request_method, request_path,
        client_ip, status_code, error_message
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      proxyConfig.id,
      req.method,
      req.url,
      req.socket.remoteAddress,
      502,
      `${err.code || 'ERROR'}: ${err.message}`
    ]).catch(() => {}); // Ignore logging errors
  }

  if (!res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Bad Gateway',
      message: 'Failed to connect to backend server',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    }));
  }
});

// Proxy success logging
proxy.on('proxyRes', (proxyRes, req, res) => {
  const startTime = req._startTime || Date.now();
  const responseTime = Date.now() - startTime;

  // Log success asynchronously (fire and forget)
  const proxyConfig = findProxyConfig(req.headers.host);
  if (proxyConfig) {
    pool.query(`
      INSERT INTO proxy_logs (
        proxy_id, request_method, request_path,
        client_ip, status_code, response_time
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      proxyConfig.id,
      req.method,
      req.url,
      req.socket.remoteAddress,
      proxyRes.statusCode,
      responseTime
    ]).catch(() => {}); // Ignore logging errors
  }
});

async function handleRequest(req, res) {
  req._startTime = Date.now();

  const hostname = req.headers.host?.split(':')[0];

  if (!hostname) {
    console.error('❌ Request without valid hostname:', req.headers);
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad Request', message: 'Invalid hostname' }));
    return;
  }

  // Detect proxy loop
  if (req.headers['x-nebula-proxy']) {
    console.error('🔁 Proxy loop detected! Backend is redirecting back to proxy.');
    res.writeHead(508, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Loop Detected',
      message: 'Backend server is redirecting back to the proxy. Check your backend configuration.'
    }));
    return;
  }

  const proxyConfig = findProxyConfig(hostname);

  if (!proxyConfig) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Not Found',
      message: 'No proxy configuration found for this domain'
    }));
    return;
  }

  // Build target URL
  let target;

  // Check if backend_url already has protocol
  if (proxyConfig.backendUrl.startsWith('http://') || proxyConfig.backendUrl.startsWith('https://')) {
    // Use backend_url as-is, append port if not in URL
    const backendUrl = new URL(proxyConfig.backendUrl);
    if (!backendUrl.port && proxyConfig.backendPort) {
      target = `${backendUrl.protocol}//${backendUrl.hostname}:${proxyConfig.backendPort}${backendUrl.pathname}`;
    } else {
      target = proxyConfig.backendUrl;
    }
  } else {
    // Fallback to old behavior for backward compatibility
    const protocol = proxyConfig.proxyType === 'https' ? 'https' : 'http';
    target = `${protocol}://${proxyConfig.backendUrl}:${proxyConfig.backendPort}`;
  }

  try {
    // Create custom HTTPS agent that ignores SSL
    const isHttps = target.startsWith('https://');
    const targetUrl = new URL(target);

    // Check if hostname is an IP address (for SNI compatibility)
    const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(targetUrl.hostname);

    const requestOptions = {
      hostname: targetUrl.hostname,
      port: targetUrl.port || (isHttps ? 443 : 80),
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers
      },
      timeout: 30000,
      rejectUnauthorized: false,
      requestCert: false,
      agent: isHttps ? globalHttpsAgent : globalHttpAgent // Use connection pooling
    };

    // Only set servername for HTTPS if hostname is not an IP (RFC 6066 compliance)
    if (isHttps && !isIpAddress) {
      requestOptions.servername = targetUrl.hostname;
    }

    const proxyRequest = (isHttps ? https : http).request(requestOptions, (proxyRes) => {
      // Copy status and headers
      res.writeHead(proxyRes.statusCode, proxyRes.headers);

      // Pipe response back
      proxyRes.pipe(res);

      // Log success in dev mode
      if (process.env.NODE_ENV === 'development') {
        const responseTime = Date.now() - req._startTime;
        console.log(`✅ ${hostname} → ${proxyRes.statusCode} (${responseTime}ms)`);
      }
    });

    proxyRequest.on('error', (err) => {
      if (process.env.NODE_ENV === 'development') {
        console.error(`❌ ${hostname}: ${err.message}`);
      }
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Bad Gateway',
          message: err.message
        }));
      }
    });

    proxyRequest.on('timeout', () => {
      console.error(`⏱️  Timeout connecting to ${target}`);
      proxyRequest.destroy();
      if (!res.headersSent) {
        res.writeHead(504, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Gateway Timeout',
          message: 'Backend server did not respond in time'
        }));
      }
    });

    // Pipe request body
    req.pipe(proxyRequest);
  } catch (error) {
    console.error('Proxy request error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal Server Error' }));
  }
}

export async function startProxyServer() {
  // HTTP Server (port 80)
  const httpServer = http.createServer(async (req, res) => {
    const hostname = req.headers.host?.split(':')[0];
    const proxyConfig = findProxyConfig(hostname);

    // Redirect to HTTPS if SSL is enabled
    if (proxyConfig && proxyConfig.sslEnabled) {
      res.writeHead(301, {
        Location: `https://${req.headers.host}${req.url}`
      });
      res.end();
      return;
    }

    await handleRequest(req, res);
  });

  httpServer.on('error', (err) => {
    if (err.code === 'EACCES') {
      console.error('❌ Permission denied to bind to port 80. Try running with elevated privileges.');
    } else if (err.code === 'EADDRINUSE') {
      console.error('❌ Port 80 is already in use.');
    } else {
      console.error('❌ HTTP server error:', err);
    }
  });

  // HTTPS Server (port 443) with SNI
  const httpsServer = https.createServer({
    SNICallback: async (domain, callback) => {
      try {
        const cert = await getCertificate(domain);
        if (cert) {
          callback(null, cert.context);
        } else {
          if (process.env.NODE_ENV === 'development') {
            console.warn(`⚠️  No certificate found for domain: ${domain}`);
          }
          callback(new Error('No certificate found for domain'));
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('❌ SNI callback error:', error);
        }
        callback(error);
      }
    }
  }, async (req, res) => {
    // Ensure we have the hostname
    if (!req.headers.host) {
      console.error('❌ HTTPS request without Host header');
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad Request', message: 'Host header required' }));
      return;
    }
    await handleRequest(req, res);
  });

  httpsServer.on('error', (err) => {
    if (err.code === 'EACCES') {
      console.error('❌ Permission denied to bind to port 443. Try running with elevated privileges.');
    } else if (err.code === 'EADDRINUSE') {
      console.error('❌ Port 443 is already in use.');
    } else {
      console.error('❌ HTTPS server error:', err);
    }
  });

  // Start servers
  try {
    httpServer.listen(80, () => {
      console.log('✅ HTTP proxy listening on port 80');
    });

    httpsServer.listen(443, () => {
      console.log('✅ HTTPS proxy listening on port 443');
    });
  } catch (error) {
    console.error('❌ Failed to start proxy servers:', error);
    console.log('💡 Tip: On Windows, you may need to run as Administrator');
    console.log('💡 Tip: On Linux/Mac, you may need to use sudo or configure port forwarding');
  }
}
