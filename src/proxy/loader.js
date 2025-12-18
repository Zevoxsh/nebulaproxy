import pool from '../database/pool.js';

// Store active proxy configurations
export const activeProxies = new Map();

export async function loadProxies() {
  try {
    const result = await pool.query(`
      SELECT * FROM proxies WHERE is_active = true
    `);

    activeProxies.clear();

    for (const proxy of result.rows) {
      activeProxies.set(proxy.domain, {
        id: proxy.id,
        domain: proxy.domain,
        backendUrl: proxy.backend_url,
        backendPort: proxy.backend_port,
        proxyType: proxy.proxy_type,
        sslEnabled: proxy.ssl_enabled,
        sslCert: proxy.ssl_cert,
        sslKey: proxy.ssl_key
      });

      // Support wildcard domains
      if (proxy.domain.startsWith('*.')) {
        const baseDomain = proxy.domain.substring(2);
        activeProxies.set(`wildcard:${baseDomain}`, {
          id: proxy.id,
          domain: proxy.domain,
          backendUrl: proxy.backend_url,
          backendPort: proxy.backend_port,
          proxyType: proxy.proxy_type,
          sslEnabled: proxy.ssl_enabled,
          sslCert: proxy.ssl_cert,
          sslKey: proxy.ssl_key,
          isWildcard: true
        });
      }
    }

    console.log(`✅ Loaded ${activeProxies.size} proxy configurations`);

  } catch (error) {
    console.error('❌ Failed to load proxies:', error);
    throw error;
  }
}

export async function reloadProxy(proxy) {
  if (proxy.is_active) {
    activeProxies.set(proxy.domain, {
      id: proxy.id,
      domain: proxy.domain,
      backendUrl: proxy.backend_url,
      backendPort: proxy.backend_port,
      proxyType: proxy.proxy_type,
      sslEnabled: proxy.ssl_enabled,
      sslCert: proxy.ssl_cert,
      sslKey: proxy.ssl_key
    });

    if (proxy.domain.startsWith('*.')) {
      const baseDomain = proxy.domain.substring(2);
      activeProxies.set(`wildcard:${baseDomain}`, {
        id: proxy.id,
        domain: proxy.domain,
        backendUrl: proxy.backend_url,
        backendPort: proxy.backend_port,
        proxyType: proxy.proxy_type,
        sslEnabled: proxy.ssl_enabled,
        sslCert: proxy.ssl_cert,
        sslKey: proxy.ssl_key,
        isWildcard: true
      });
    }

    console.log(`✅ Reloaded proxy: ${proxy.domain}`);
  } else {
    await removeProxy(proxy.domain);
  }
}

export async function removeProxy(domain) {
  activeProxies.delete(domain);

  if (domain.startsWith('*.')) {
    const baseDomain = domain.substring(2);
    activeProxies.delete(`wildcard:${baseDomain}`);
  }

  console.log(`✅ Removed proxy: ${domain}`);
}

export function findProxyConfig(hostname) {
  // Handle undefined or null hostname
  if (!hostname) {
    console.warn('⚠️  findProxyConfig called with undefined hostname');
    return null;
  }

  // Direct match
  if (activeProxies.has(hostname)) {
    return activeProxies.get(hostname);
  }

  // Wildcard match
  const parts = hostname.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const baseDomain = parts.slice(i).join('.');
    const wildcardKey = `wildcard:${baseDomain}`;
    if (activeProxies.has(wildcardKey)) {
      return activeProxies.get(wildcardKey);
    }
  }

  return null;
}
