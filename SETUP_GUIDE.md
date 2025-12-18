# 🚀 Nebula Proxy - Complete Setup Guide

This guide will walk you through setting up Nebula Proxy from scratch.

## 📋 Prerequisites Checklist

Before starting, ensure you have:

- [ ] Node.js 18 or higher installed ([Download](https://nodejs.org/))
- [ ] PostgreSQL 13 or higher installed ([Download](https://www.postgresql.org/download/))
- [ ] Administrator/sudo privileges (required for ports 80/443)
- [ ] Basic knowledge of command line

## 🔧 Installation Steps

### Step 1: Install Dependencies

**Windows:**
```cmd
install.bat
```

**Linux/Mac:**
```bash
npm install
```

### Step 2: Configure PostgreSQL

1. **Start PostgreSQL service**

   **Windows:**
   - Open Services (Win + R, type `services.msc`)
   - Find "postgresql-x64-XX" and start it

   **Linux:**
   ```bash
   sudo systemctl start postgresql
   ```

   **Mac:**
   ```bash
   brew services start postgresql
   ```

2. **Create database**

   ```bash
   # Connect to PostgreSQL
   psql -U postgres

   # Create database
   CREATE DATABASE nebula_proxy;

   # Exit
   \q
   ```

   Or using command line directly:
   ```bash
   createdb nebula_proxy -U postgres
   ```

### Step 3: Configure Environment

The `.env` file has been created for you with default values. Update these settings:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nebula_proxy
DB_USER=postgres
DB_PASSWORD=YOUR_POSTGRES_PASSWORD  # ⚠️ Change this!

# JWT Configuration
JWT_SECRET=YOUR_RANDOM_SECRET_KEY  # ⚠️ Change this!
JWT_EXPIRES_IN=24h

# Server Configuration
PORT=3000
NODE_ENV=development  # Change to 'production' for production

# SSL Configuration
SSL_EMAIL=your-email@example.com  # ⚠️ Change this!
SSL_STAGING=false

# Admin Account
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin123  # ⚠️ Change this!
```

### Step 4: Start the Server

**Windows (as Administrator):**
```cmd
start.bat
```

Or manually:
```cmd
node src/index.js
```

**Linux/Mac:**
```bash
# Option 1: With sudo (for ports 80/443)
sudo npm start

# Option 2: Allow Node.js to bind to privileged ports
sudo setcap 'cap_net_bind_service=+ep' $(which node)
npm start
```

### Step 5: Access Admin Panel

1. Open browser to: `http://localhost:3000`
2. Login with credentials from `.env`:
   - Email: `admin@example.com`
   - Password: `admin123`

## 🎯 First Proxy Configuration

Let's create your first proxy configuration:

### Example 1: Simple HTTP Proxy

**Scenario:** Proxy `myapp.local` to local service on port 8080

1. Click **"➕ Add Domain"**
2. Fill in:
   - **Domain**: `myapp.local`
   - **Backend URL**: `localhost`
   - **Backend Port**: `8080`
   - **SSL/TLS**: Disabled
3. Click **"Save Domain"**

Now requests to `http://myapp.local` (port 80) will proxy to `http://localhost:8080`

### Example 2: Wildcard Domain with SSL

**Scenario:** Proxy all `*.myapp.com` subdomains with HTTPS

1. Click **"➕ Add Domain"**
2. Fill in:
   - **Domain**: `*.myapp.com`
   - **Backend URL**: `192.168.1.100`
   - **Backend Port**: `3000`
   - **SSL/TLS**: Enabled ✓
3. Click **"Save Domain"**

Now requests to:
- `https://api.myapp.com` → `http://192.168.1.100:3000`
- `https://www.myapp.com` → `http://192.168.1.100:3000`
- Any subdomain → Same backend

### Example 3: Backend HTTPS

**Scenario:** Proxy to HTTPS backend

1. Click **"➕ Add Domain"**
2. Fill in:
   - **Domain**: `secure.example.com`
   - **Backend URL**: `https://backend.internal`
   - **Backend Port**: `443`
   - **SSL/TLS**: Enabled ✓
3. Click **"Save Domain"**

## 🔒 DNS Configuration

For your proxy to work, you need to point domains to your proxy server.

### For Local Testing

Edit your hosts file:

**Windows:** `C:\Windows\System32\drivers\etc\hosts`
**Linux/Mac:** `/etc/hosts`

Add:
```
127.0.0.1  myapp.local
127.0.0.1  api.myapp.local
```

### For Production

Point your domain's A record to your server's IP:

```
Type: A
Host: @
Value: YOUR_SERVER_IP
TTL: 3600

Type: A
Host: *
Value: YOUR_SERVER_IP
TTL: 3600
```

## 🔐 SSL Certificates

### Development

Nebula automatically generates self-signed certificates for development. Your browser will show a warning - this is expected.

To trust the certificate:
1. Click "Advanced" in browser warning
2. Click "Proceed to site"

### Production with Let's Encrypt

For production, update `src/ssl/manager.js` to use Let's Encrypt:

```bash
npm install acme-client
```

Ensure:
- Domain's DNS points to your server
- Ports 80 and 443 are accessible from internet
- Valid email in `SSL_EMAIL` environment variable

## 🐛 Troubleshooting

### Port Permission Denied

**Windows:**
- Run Command Prompt/PowerShell as Administrator
- Execute: `start.bat`

**Linux/Mac:**
```bash
# Option 1: Use sudo
sudo npm start

# Option 2: Allow Node.js to bind privileged ports
sudo setcap 'cap_net_bind_service=+ep' $(which node)
npm start
```

### Database Connection Failed

1. Check PostgreSQL is running:
   ```bash
   # Windows
   services.msc

   # Linux
   sudo systemctl status postgresql

   # Mac
   brew services list
   ```

2. Verify credentials in `.env`
3. Test connection:
   ```bash
   psql -U postgres -d nebula_proxy
   ```

### Tables Not Created

Tables are created automatically on first start. If they're missing:

```bash
# Check logs for errors
npm start

# The startup script runs database migrations automatically
```

### "No proxy configuration found"

1. Ensure DNS/hosts file points to proxy server
2. Check domain matches exactly in admin panel
3. Verify proxy is marked as "Active"

### SSL Certificate Error

**Development:**
- Self-signed certificates are normal
- Browser warnings are expected
- Click "Advanced" → "Proceed"

**Production:**
- Ensure DNS points to your server
- Verify port 80 is accessible
- Check `SSL_EMAIL` in `.env`

## 📊 Monitoring

### View Statistics

Dashboard shows:
- Total proxies
- Active proxies
- Requests (last 24h)
- Average response time

### View Logs

Navigate to **"📝 Logs"** to see:
- Request timestamps
- HTTP methods
- Status codes
- Response times
- Error messages

## 🔧 Advanced Configuration

### Change Admin Panel Port

Edit `.env`:
```env
PORT=8080  # Change from 3000 to 8080
```

### Enable CORS

Edit `src/admin/server.js`:
```javascript
app.use(cors({
  origin: 'https://yourdomain.com',  // Specific origin
  credentials: true
}));
```

### Add Multiple Admin Users

1. Login to admin panel
2. API calls are not yet exposed in UI
3. Use API directly:
   ```bash
   curl -X POST http://localhost:3000/api/auth/register \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"email":"user@example.com","password":"secure123","isAdmin":false}'
   ```

## 🚀 Production Deployment

### Using PM2

```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start src/index.js --name nebula-proxy

# Save PM2 configuration
pm2 save

# Setup auto-start on boot
pm2 startup
```

### Using systemd (Linux)

Create `/etc/systemd/system/nebula-proxy.service`:

```ini
[Unit]
Description=Nebula Proxy Server
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/path/to/nebula
ExecStart=/usr/bin/node src/index.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable nebula-proxy
sudo systemctl start nebula-proxy
sudo systemctl status nebula-proxy
```

## 📝 Next Steps

1. ✅ Server running
2. ✅ Admin panel accessible
3. ✅ First proxy created
4. 🔄 Configure DNS for your domains
5. 🔒 Enable SSL for production domains
6. 📊 Monitor logs and statistics
7. 🚀 Deploy to production server

## 💡 Tips

- Use wildcard domains (`*.example.com`) for multiple subdomains
- Enable SSL for all public-facing domains
- Regularly check SSL certificate expiration
- Monitor logs for errors
- Keep PostgreSQL backed up
- Use strong JWT_SECRET in production
- Never commit `.env` to version control

## 🆘 Getting Help

If you encounter issues:

1. Check this guide's troubleshooting section
2. Review server logs
3. Check database connection
4. Verify DNS configuration
5. Open an issue on GitHub

---

Happy proxying! 🌌
