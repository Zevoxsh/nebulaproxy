# 🌌 Nebula Proxy

Enterprise-grade reverse proxy server with automatic SSL certificate generation, PostgreSQL backend, and beautiful dark-themed admin panel.

## ✨ Features

- **🌐 Reverse Proxy**: HTTP→HTTP, HTTP→HTTPS, HTTPS→HTTP, HTTPS→HTTPS
- **🔐 Auto SSL**: Automatic SSL certificate generation with Let's Encrypt
- **🎯 Wildcard Domains**: Support for `*.example.com` patterns
- **📊 PostgreSQL Backend**: Robust database with auto-migration
- **🔒 JWT Authentication**: Secure API with JWT tokens
- **📈 Real-time Stats**: Dashboard with proxy performance metrics
- **📝 Request Logging**: Complete audit trail of all proxy requests
- **🎨 Beautiful UI**: Professional dark-themed admin panel
- **⚡ High Performance**: Built on Node.js with http-proxy

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 13+
- OpenSSL (for SSL certificate generation)

### Installation

1. **Clone the repository**
```bash
cd nebula
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment**
```bash
cp .env.example .env
```

Edit `.env` and set your configuration:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nebula_proxy
DB_USER=postgres
DB_PASSWORD=your_password

JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
JWT_EXPIRES_IN=24h

PORT=3000
NODE_ENV=production

SSL_EMAIL=admin@yourdomain.com
SSL_STAGING=false

ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin123
```

4. **Create PostgreSQL database**
```bash
createdb nebula_proxy
```

5. **Start the server**
```bash
npm start
```

The server will:
- Initialize the database and create tables automatically
- Start the admin panel on port 3000
- Start the HTTP proxy on port 80
- Start the HTTPS proxy on port 443

## 🎯 Usage

### Access the Admin Panel

1. Open your browser to `http://localhost:3000`
2. Login with your admin credentials (from `.env`)
3. Start adding proxy configurations!

### Adding a Proxy

1. Click **"➕ Add Domain"**
2. Choose proxy type (HTTP/HTTPS or TCP)
3. Enter domain name (supports wildcards like `*.example.com`)
4. Enter backend URL (e.g., `192.168.1.100`)
5. Enter backend port (e.g., `8080`)
6. Enable SSL/TLS if needed
7. Click **"Save Domain"**

### Wildcard Domain Examples

- `*.plumsy.dev` → Matches `api.plumsy.dev`, `www.plumsy.dev`, etc.
- `example.com` → Exact match only
- `*.api.example.com` → Matches all subdomains of api.example.com

### Proxy Examples

**HTTP → HTTP**
```
Domain: example.com
Backend: 192.168.1.100
Port: 8080
SSL: Disabled
```

**HTTPS → HTTP**
```
Domain: secure.example.com
Backend: 192.168.1.100
Port: 8080
SSL: Enabled
```

**HTTP → HTTPS**
```
Domain: api.example.com
Backend: https://backend.internal
Port: 443
SSL: Disabled
```

## 🔒 Security Features

- **JWT Authentication**: All API endpoints protected with JWT tokens
- **Password Hashing**: bcrypt with salt rounds
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Helmet.js**: Security headers
- **SQL Injection Protection**: Parameterized queries
- **CORS**: Configurable cross-origin policies
- **Input Validation**: Express-validator on all inputs

## 📊 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - Create user (admin only)
- `GET /api/auth/me` - Get current user

### Proxies
- `GET /api/proxies` - List all proxies
- `GET /api/proxies/:id` - Get single proxy
- `POST /api/proxies` - Create proxy
- `PUT /api/proxies/:id` - Update proxy
- `DELETE /api/proxies/:id` - Delete proxy

### SSL Certificates
- `GET /api/ssl` - List all certificates
- `POST /api/ssl/request/:domain` - Request certificate
- `POST /api/ssl/renew/:domain` - Renew certificate

### Statistics
- `GET /api/stats/dashboard` - Dashboard statistics
- `GET /api/stats/logs/:proxyId?` - Proxy logs

## 🗄️ Database Schema

### Tables
- **users**: User accounts and authentication
- **proxies**: Proxy configurations
- **ssl_certificates**: SSL certificate storage
- **proxy_logs**: Request logging and analytics
- **sessions**: Active user sessions

## 🛠️ Development

### Development Mode
```bash
npm run dev
```

This starts the server with auto-reload on file changes.

### Database Migration
```bash
npm run migrate
```

## 🐳 Production Deployment

### Using PM2
```bash
npm install -g pm2
pm2 start src/index.js --name nebula-proxy
pm2 save
pm2 startup
```

### Using Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 80 443 3000
CMD ["node", "src/index.js"]
```

### Important Notes for Production

1. **Ports 80 and 443**: Require elevated privileges
   - Linux/Mac: Use `sudo` or configure port forwarding
   - Windows: Run as Administrator

2. **SSL Certificates**:
   - Self-signed certificates are generated for development
   - For production, integrate Let's Encrypt (acme-client recommended)

3. **Database**:
   - Use connection pooling (already configured)
   - Regular backups recommended

4. **Environment Variables**:
   - Always change `JWT_SECRET` in production
   - Use strong admin password
   - Set `NODE_ENV=production`

## 📝 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_NAME` | Database name | `nebula_proxy` |
| `DB_USER` | Database user | `postgres` |
| `DB_PASSWORD` | Database password | - |
| `JWT_SECRET` | JWT signing secret | - |
| `JWT_EXPIRES_IN` | Token expiration | `24h` |
| `PORT` | Admin panel port | `3000` |
| `NODE_ENV` | Environment | `production` |
| `SSL_EMAIL` | Let's Encrypt email | - |
| `SSL_STAGING` | Use Let's Encrypt staging | `false` |
| `ADMIN_EMAIL` | Initial admin email | `admin@example.com` |
| `ADMIN_PASSWORD` | Initial admin password | `admin123` |

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - feel free to use this project for any purpose.

## 🐛 Troubleshooting

### Port 80/443 Permission Denied

**Linux/Mac:**
```bash
sudo setcap 'cap_net_bind_service=+ep' $(which node)
# or use sudo
sudo npm start
```

**Windows:**
Run PowerShell/CMD as Administrator

### Database Connection Failed

1. Ensure PostgreSQL is running
2. Check database credentials in `.env`
3. Create database: `createdb nebula_proxy`

### SSL Certificate Error

For development, self-signed certificates are used. Browsers will show warnings - this is expected.

For production, integrate Let's Encrypt using the `acme-client` or `greenlock` package.

## 📞 Support

For issues and questions, please open an issue on GitHub.

---

Made with ❤️ by the Nebula Team
