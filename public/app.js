// State
let authToken = localStorage.getItem('authToken');
let currentUser = null;
let currentProxyId = null;

// DOM Elements
const loginPage = document.getElementById('loginPage');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');
const userEmail = document.getElementById('userEmail');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    if (authToken) {
        verifyToken();
    } else {
        showLogin();
    }

    setupEventListeners();
});

// Setup Event Listeners
function setupEventListeners() {
    // Login
    loginForm.addEventListener('submit', handleLogin);
    logoutBtn.addEventListener('click', handleLogout);

    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = e.currentTarget.dataset.page;
            navigateTo(page);
        });
    });

    // Modal
    document.getElementById('addProxyBtn').addEventListener('click', () => openProxyModal());
    document.getElementById('closeModal').addEventListener('click', closeProxyModal);
    document.getElementById('cancelModal').addEventListener('click', closeProxyModal);
    document.getElementById('proxyForm').addEventListener('submit', handleProxySubmit);

    // Close modal on backdrop click
    document.getElementById('proxyModal').addEventListener('click', (e) => {
        if (e.target.id === 'proxyModal') {
            closeProxyModal();
        }
    });
}

// Auth Functions
async function handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (data.success) {
            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem('authToken', authToken);
            showDashboard();
        } else {
            showError(data.error || 'Login failed');
        }
    } catch (error) {
        showError('Network error. Please try again.');
    }
}

function handleLogout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('authToken');
    showLogin();
}

async function verifyToken() {
    try {
        const response = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const data = await response.json();

        if (data.success) {
            currentUser = data.user;
            showDashboard();
        } else {
            handleLogout();
        }
    } catch (error) {
        handleLogout();
    }
}

function showLogin() {
    loginPage.style.display = 'flex';
    dashboard.style.display = 'none';
}

function showDashboard() {
    loginPage.style.display = 'none';
    dashboard.style.display = 'flex';
    userEmail.textContent = currentUser.email;
    loadDashboardData();
}

function showError(message) {
    loginError.textContent = message;
    loginError.style.display = 'block';
    setTimeout(() => {
        loginError.style.display = 'none';
    }, 5000);
}

// Navigation
function navigateTo(page) {
    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === page) {
            item.classList.add('active');
        }
    });

    // Show page
    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
    });
    document.getElementById(`${page}Page`).classList.add('active');

    // Load page data
    switch (page) {
        case 'overview':
            loadStats();
            break;
        case 'proxies':
            loadProxies();
            break;
        case 'ssl':
            loadSSL();
            break;
        case 'logs':
            loadLogs();
            break;
    }
}

// Data Loading
async function loadDashboardData() {
    await loadStats();
    await loadProxies();
}

async function loadStats() {
    try {
        const response = await fetch('/api/stats/dashboard', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const data = await response.json();

        if (data.success) {
            document.getElementById('totalProxies').textContent = data.stats.proxies.total;
            document.getElementById('activeProxies').textContent = data.stats.proxies.active;
            document.getElementById('totalRequests').textContent = data.stats.requests.last24h.toLocaleString();
            document.getElementById('avgResponseTime').textContent = Math.round(data.stats.performance.avgResponseTime) + 'ms';
        }
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

async function loadProxies() {
    const tbody = document.getElementById('proxiesTableBody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Loading...</td></tr>';

    try {
        const response = await fetch('/api/proxies', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const data = await response.json();

        if (data.success && data.proxies.length > 0) {
            tbody.innerHTML = data.proxies.map(proxy => `
                <tr>
                    <td><strong>${proxy.domain}</strong></td>
                    <td>${proxy.backend_url}:${proxy.backend_port}</td>
                    <td><span class="badge">${proxy.proxy_type.toUpperCase()}</span></td>
                    <td>${proxy.ssl_enabled ? '<span class="badge badge-success">Enabled</span>' : '<span class="badge">Disabled</span>'}</td>
                    <td>${proxy.is_active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-danger">Inactive</span>'}</td>
                    <td>
                        <button class="action-btn action-btn-edit" onclick="editProxy(${proxy.id})">✏️ Edit</button>
                        <button class="action-btn action-btn-delete" onclick="deleteProxy(${proxy.id}, '${proxy.domain}')">🗑️ Delete</button>
                    </td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No proxies configured</td></tr>';
        }
    } catch (error) {
        console.error('Failed to load proxies:', error);
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Failed to load proxies</td></tr>';
    }
}

async function loadSSL() {
    const tbody = document.getElementById('sslTableBody');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Loading...</td></tr>';

    try {
        const response = await fetch('/api/ssl', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const data = await response.json();

        if (data.success && data.certificates.length > 0) {
            tbody.innerHTML = data.certificates.map(cert => {
                const expiresAt = new Date(cert.expires_at);
                const daysUntilExpiry = Math.floor((expiresAt - new Date()) / (1000 * 60 * 60 * 24));
                const expiryClass = daysUntilExpiry < 30 ? 'badge-danger' : 'badge-success';

                return `
                    <tr>
                        <td><strong>${cert.domain}</strong></td>
                        <td>${new Date(cert.issued_at).toLocaleDateString()}</td>
                        <td><span class="badge ${expiryClass}">${expiresAt.toLocaleDateString()} (${daysUntilExpiry} days)</span></td>
                        <td>${cert.auto_renew ? '<span class="badge badge-success">Yes</span>' : '<span class="badge">No</span>'}</td>
                        <td>
                            <button class="action-btn action-btn-edit" onclick="renewSSL('${cert.domain}')">🔄 Renew</button>
                        </td>
                    </tr>
                `;
            }).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">No SSL certificates</td></tr>';
        }
    } catch (error) {
        console.error('Failed to load SSL certificates:', error);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Failed to load certificates</td></tr>';
    }
}

async function loadLogs() {
    const tbody = document.getElementById('logsTableBody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Loading...</td></tr>';

    try {
        const response = await fetch('/api/stats/logs?limit=50', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const data = await response.json();

        if (data.success && data.logs.length > 0) {
            tbody.innerHTML = data.logs.map(log => {
                const statusClass = log.status_code >= 400 ? 'badge-danger' : log.status_code >= 300 ? 'badge-warning' : 'badge-success';
                return `
                    <tr>
                        <td>${new Date(log.created_at).toLocaleString()}</td>
                        <td>${log.domain || 'Unknown'}</td>
                        <td><span class="badge">${log.request_method}</span></td>
                        <td>${log.request_path}</td>
                        <td><span class="badge ${statusClass}">${log.status_code}</span></td>
                        <td>${log.response_time ? log.response_time + 'ms' : '-'}</td>
                    </tr>
                `;
            }).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No logs available</td></tr>';
        }
    } catch (error) {
        console.error('Failed to load logs:', error);
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Failed to load logs</td></tr>';
    }
}

// Proxy Management
function openProxyModal(proxyId = null) {
    currentProxyId = proxyId;
    const modal = document.getElementById('proxyModal');
    const form = document.getElementById('proxyForm');

    if (proxyId) {
        // Load proxy data and populate form
        document.getElementById('modalTitle').textContent = 'Edit Domain';
        loadProxyForEdit(proxyId);
    } else {
        document.getElementById('modalTitle').textContent = 'Add Domain';
        form.reset();
    }

    modal.classList.add('active');
}

function closeProxyModal() {
    const modal = document.getElementById('proxyModal');
    modal.classList.remove('active');
    currentProxyId = null;
}

async function loadProxyForEdit(proxyId) {
    try {
        const response = await fetch(`/api/proxies/${proxyId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const data = await response.json();

        if (data.success) {
            const proxy = data.proxy;
            document.getElementById('domain').value = proxy.domain;
            document.getElementById('backend_url').value = proxy.backend_url;
            document.getElementById('backend_port').value = proxy.backend_port;
            document.getElementById('description').value = proxy.description || '';
            document.getElementById('ssl_enabled').checked = proxy.ssl_enabled;
            document.querySelector(`input[name="proxy_type"][value="${proxy.proxy_type}"]`).checked = true;
        }
    } catch (error) {
        console.error('Failed to load proxy:', error);
        alert('Failed to load proxy data');
        closeProxyModal();
    }
}

async function handleProxySubmit(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const backendUrl = formData.get('backend_url');
    const backendPort = formData.get('backend_port');

    // Parse port from URL if not explicitly provided
    let finalPort = backendPort ? parseInt(backendPort) : null;

    if (!finalPort && backendUrl) {
        try {
            const urlObj = new URL(backendUrl);
            if (urlObj.port) {
                finalPort = parseInt(urlObj.port);
            } else {
                // Use default ports if not specified
                finalPort = urlObj.protocol === 'https:' ? 443 : 80;
            }
        } catch (e) {
            // If URL parsing fails, require explicit port
            if (!backendPort) {
                alert('Please specify a port or include it in the Backend URL');
                return;
            }
        }
    }

    const data = {
        domain: formData.get('domain'),
        backend_url: backendUrl,
        backend_port: finalPort,
        proxy_type: formData.get('proxy_type'),
        description: formData.get('description'),
        ssl_enabled: formData.get('ssl_enabled') === 'on'
    };

    try {
        const url = currentProxyId ? `/api/proxies/${currentProxyId}` : '/api/proxies';
        const method = currentProxyId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            closeProxyModal();
            loadProxies();
            loadStats();
            alert(currentProxyId ? 'Proxy updated successfully!' : 'Proxy created successfully!');
        } else {
            alert(result.error || 'Failed to save proxy');
        }
    } catch (error) {
        console.error('Failed to save proxy:', error);
        alert('Network error. Please try again.');
    }
}

async function deleteProxy(proxyId, domain) {
    if (!confirm(`Are you sure you want to delete the proxy for "${domain}"?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/proxies/${proxyId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const data = await response.json();

        if (data.success) {
            loadProxies();
            loadStats();
            alert('Proxy deleted successfully!');
        } else {
            alert(data.error || 'Failed to delete proxy');
        }
    } catch (error) {
        console.error('Failed to delete proxy:', error);
        alert('Network error. Please try again.');
    }
}

// Make functions globally accessible
window.editProxy = openProxyModal;
window.deleteProxy = deleteProxy;

async function renewSSL(domain) {
    if (!confirm(`Renew SSL certificate for "${domain}"?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/ssl/renew/${domain}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const data = await response.json();

        if (data.success) {
            loadSSL();
            alert('SSL certificate renewed successfully!');
        } else {
            alert(data.error || 'Failed to renew certificate');
        }
    } catch (error) {
        console.error('Failed to renew certificate:', error);
        alert('Network error. Please try again.');
    }
}

window.renewSSL = renewSSL;
