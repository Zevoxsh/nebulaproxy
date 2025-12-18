import http from 'http';
import https from 'https';
import httpProxy from 'http-proxy';
import { findProxyConfig } from './loader.js';
import { getCertificate } from '../ssl/manager.js';
import pool from '../database/pool.js';

const proxy = httpProxy.createProxyServer({
  xfwd: true,
  secure: false,
  changeOrigin: true
});

// Error handling
proxy.on('error', async (err, req, res) => {
  console.error('Proxy error:', err.message);

  try {
    // Log error
    const proxyConfig = findProxyConfig(req.headers.host);
    if (proxyConfig) {
      await pool.query(`
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
        err.message
      ]);
    }
  } catch (logError) {
    console.error('Failed to log error:', logError);
  }

  if (!res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Bad Gateway',
      message: 'Failed to connect to backend server'
    }));
  }
});

// Proxy success logging
proxy.on('proxyRes', async (proxyRes, req, res) => {
  const startTime = req._startTime || Date.now();
  const responseTime = Date.now() - startTime;

  try {
    const proxyConfig = findProxyConfig(req.headers.host);
    if (proxyConfig) {
      await pool.query(`
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
      ]);
    }
  } catch (logError) {
    console.error('Failed to log request:', logError);
  }
});

async function handleRequest(req, res) {
  req._startTime = Date.now();

  const hostname = req.headers.host?.split(':')[0];

  if (!hostname) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad Request', message: 'Invalid hostname' }));
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
    proxy.web(req, res, {
      target,
      secure: false,
      changeOrigin: true
    });
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
          callback(new Error('No certificate found for domain'));
        }
      } catch (error) {
        console.error('SNI callback error:', error);
        callback(error);
      }
    }
  }, handleRequest);

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
