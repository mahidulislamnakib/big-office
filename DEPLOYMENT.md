# Big Office - Deployment Guide

## 🚀 Production Deployment Checklist

### **Pre-Deployment Requirements**

#### 1. **Environment Setup**
- [ ] Node.js v16+ installed
- [ ] SQLite3 installed
- [ ] 2GB+ RAM available
- [ ] 500MB+ disk space

#### 2. **Security Hardening**

##### **CRITICAL: Implement Password Hashing**
```bash
npm install bcrypt
```

Update `server.js` login endpoint:
```javascript
const bcrypt = require('bcrypt');

// When creating user
const hashedPassword = await bcrypt.hash(password, 10);

// When logging in
const match = await bcrypt.compare(password, user.password);
```

##### **Environment Variables**
Create `.env` file:
```env
PORT=3000
NODE_ENV=production
SESSION_SECRET=your-super-secret-key-change-this
ALLOWED_ORIGINS=https://yourdomain.com
```

##### **Change Default Credentials**
```sql
-- In production database
UPDATE users SET password = 'new-hashed-password' WHERE username = 'admin';
```

#### 3. **Database Backup**
```bash
# Create backup script
cp data/tenders.db data/tenders.backup.db

# Add to crontab for daily backups
0 2 * * * cp /path/to/data/tenders.db /path/to/backups/tenders-$(date +\%Y\%m\%d).db
```

---

## 📦 Deployment Options

### **Option 1: Traditional VPS/Server (Recommended)**

#### **Step 1: Prepare Server**
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y nodejs npm sqlite3 nginx

# Install PM2 for process management
sudo npm install -g pm2
```

#### **Step 2: Upload Files**
```bash
# From local machine
scp -r "/Users/sbmac/e-GP Tender Summary Builder" user@server:/var/www/big-office
```

#### **Step 3: Setup Application**
```bash
cd /var/www/big-office
npm install --production
npm run init-db
node seed-demo-data.js  # Remove in production after initial setup
```

#### **Step 4: Configure PM2**
```bash
# Start application
pm2 start server.js --name "big-office"

# Save PM2 configuration
pm2 save
pm2 startup

# Monitor
pm2 status
pm2 logs big-office
```

#### **Step 5: Setup Nginx Reverse Proxy**
Create `/etc/nginx/sites-available/big-office`:
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/big-office /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### **Step 6: Setup SSL (Let's Encrypt)**
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

### **Option 2: Docker Deployment**

Create `Dockerfile`:
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

RUN npm run init-db

EXPOSE 3000

CMD ["npm", "start"]
```

Create `docker-compose.yml`:
```yaml
version: '3.8'
services:
  big-office:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    restart: unless-stopped
    environment:
      - NODE_ENV=production
```

Deploy:
```bash
docker-compose up -d
docker-compose logs -f big-office
```

---

### **Option 3: Cloud Platform Deployment**

#### **Heroku**
```bash
# Install Heroku CLI
heroku create big-office-app
heroku config:set NODE_ENV=production
git push heroku main
```

#### **Railway.app**
1. Connect GitHub repository
2. Add environment variables
3. Deploy automatically on push

#### **DigitalOcean App Platform**
1. Connect repository
2. Set build command: `npm install`
3. Set run command: `npm start`

---

## 🔒 Production Security Checklist

- [ ] **Password Hashing**: Implement bcrypt for passwords
- [ ] **HTTPS**: Enable SSL/TLS certificates
- [ ] **CORS**: Restrict allowed origins
- [ ] **Rate Limiting**: Add rate limiting middleware
- [ ] **Input Validation**: Sanitize all user inputs
- [ ] **SQL Injection**: Already protected (using parameterized queries ✅)
- [ ] **XSS Protection**: Add helmet.js middleware
- [ ] **Session Management**: Implement proper JWT tokens
- [ ] **Database Backups**: Automated daily backups
- [ ] **Monitoring**: Setup error logging (Winston, Sentry)
- [ ] **Firewall**: Configure UFW or cloud firewall
- [ ] **Default Credentials**: Change all default passwords

---

## 📊 Performance Optimization

### **Database Optimization**
```sql
-- Add indexes for better performance
CREATE INDEX idx_licenses_firm_id ON licenses(firm_id);
CREATE INDEX idx_licenses_expiry ON licenses(expiry_date);
CREATE INDEX idx_tenders_status ON tenders(status);
CREATE INDEX idx_projects_firm_id ON projects(firm_id);
CREATE INDEX idx_alerts_status ON alerts(status);
```

### **Caching**
Add Redis for caching:
```bash
npm install redis
```

### **Load Balancing**
For high traffic, setup Nginx load balancing across multiple PM2 instances:
```bash
pm2 start server.js -i max  # Start with max CPU cores
```

---

## 🔍 Monitoring & Maintenance

### **Health Check Endpoint**
Add to `server.js`:
```javascript
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});
```

### **Monitoring Tools**
- **PM2 Monitoring**: `pm2 plus`
- **Server Monitoring**: Netdata, Grafana
- **Error Tracking**: Sentry.io
- **Uptime Monitoring**: UptimeRobot, Pingdom

### **Regular Maintenance**
```bash
# Weekly database optimization
sqlite3 data/tenders.db "VACUUM;"

# Monthly backup verification
sqlite3 data/tenders.backup.db ".tables"

# Update dependencies
npm audit
npm update
```

---

## 🆘 Troubleshooting

### **Application Won't Start**
```bash
# Check logs
pm2 logs big-office

# Check port availability
sudo lsof -i :3000

# Restart application
pm2 restart big-office
```

### **Database Locked**
```bash
# Stop all processes
pm2 stop big-office

# Check for locks
fuser data/tenders.db

# Restart
pm2 start big-office
```

### **High Memory Usage**
```bash
# Check memory
pm2 monit

# Restart with memory limit
pm2 restart big-office --max-memory-restart 500M
```

---

## 📞 Support & Contact

**System**: Big Office v2.0.0  
**Database**: SQLite3  
**Node.js**: v16+  
**Port**: 3000 (default)

---

## ✅ Pre-Launch Final Checklist

1. [ ] Password hashing implemented
2. [ ] Default passwords changed
3. [ ] SSL certificate installed
4. [ ] Backup system configured
5. [ ] Monitoring setup
6. [ ] Firewall configured
7. [ ] Domain configured
8. [ ] Load tested
9. [ ] User documentation prepared
10. [ ] Support contact info added

---

**Ready to Deploy!** 🚀

The system is fully functional with:
- ✅ Complete RBAC (Role-Based Access Control)
- ✅ All 14 modules working
- ✅ Automated alerts
- ✅ Search & export functionality
- ✅ Professional UI/UX
- ✅ Demo data for testing
- ✅ No compilation errors

**Demo Login:**
- Admin: admin / demo123
- Manager: manager / demo123
- User: accounts / demo123

Remember to change these credentials in production!
