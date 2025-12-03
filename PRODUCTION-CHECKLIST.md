# Production Deployment Checklist

## ✅ Pre-Deployment (Complete These First)

### Security
- [ ] **Install bcrypt**: `npm install bcrypt`
- [ ] **Update login authentication** in `server.js`:
  ```javascript
  const bcrypt = require('bcrypt');
  const match = await bcrypt.compare(password, user.password);
  ```
- [ ] **Change all default passwords** in production database
- [ ] **Create `.env` file** from `.env.example` and update secrets
- [ ] **Review CORS settings** - restrict allowed origins
- [ ] **Remove or secure demo data seeding** - don't run `seed-demo-data.js` in production

### Database
- [ ] **Backup existing data** if upgrading
- [ ] **Set up automated backups** (daily minimum)
- [ ] **Add database indexes** for performance
- [ ] **Test database migrations**

### Application
- [ ] **Update package.json** - set version, description, author
- [ ] **Review all TODO comments** in code
- [ ] **Remove console.log statements** or use proper logging
- [ ] **Test all modules** with real data
- [ ] **Test RBAC permissions** with all user roles

### Infrastructure
- [ ] **Server with 2GB+ RAM** available
- [ ] **Domain name** configured (if applicable)
- [ ] **SSL certificate** ready (Let's Encrypt recommended)
- [ ] **Firewall rules** configured (allow ports 80, 443, optionally 3000)
- [ ] **Nginx or Apache** installed for reverse proxy

---

## 🚀 Deployment Steps

### 1. Server Preparation
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2
sudo npm install -g pm2

# Install Nginx
sudo apt install -y nginx

# Install SQLite
sudo apt install -y sqlite3
```

### 2. Application Setup
```bash
# Create application directory
sudo mkdir -p /var/www/big-office
sudo chown $USER:$USER /var/www/big-office

# Upload files (from local machine)
scp -r "/Users/sbmac/e-GP Tender Summary Builder/"* user@server:/var/www/big-office/

# Or clone from Git
cd /var/www/big-office
git clone your-repo-url .

# Install dependencies
npm install --production

# Setup environment
cp .env.example .env
nano .env  # Update configuration

# Initialize database
npm run init-db

# Don't run seed-demo-data.js in production!
```

### 3. Start Application
```bash
# Using deployment script
chmod +x deploy.sh
./deploy.sh

# Or manually with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Follow instructions to setup auto-start
```

### 4. Configure Nginx
```bash
sudo nano /etc/nginx/sites-available/big-office
```

Paste configuration:
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/big-office /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5. Setup SSL
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

### 6. Setup Backups
```bash
# Create backup directory
mkdir -p /var/www/big-office/data/backups

# Create backup script
cat > /var/www/big-office/backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
cp /var/www/big-office/data/tenders.db /var/www/big-office/data/backups/tenders_$DATE.db
# Keep only last 30 days
find /var/www/big-office/data/backups -name "tenders_*.db" -mtime +30 -delete
EOF

chmod +x /var/www/big-office/backup.sh

# Add to crontab (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * /var/www/big-office/backup.sh") | crontab -
```

---

## ✅ Post-Deployment Verification

### Test All Features
- [ ] **Login** with admin account
- [ ] **Create a firm** with categories
- [ ] **Add a license** with expiry date
- [ ] **Create a tender** and assign to firm
- [ ] **Test user permissions** (login as manager, user)
- [ ] **Check alerts** are generating
- [ ] **Test search** functionality
- [ ] **Export to CSV** works
- [ ] **Forms display** properly with Title Case
- [ ] **Mobile responsive** check

### Monitor Performance
```bash
# Check application status
pm2 status
pm2 monit

# Check logs
pm2 logs big-office

# Check memory usage
free -h

# Check disk space
df -h

# Check Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Security Scan
- [ ] **Test HTTPS** is working
- [ ] **Verify HTTP redirects** to HTTPS
- [ ] **Test password login** with new credentials
- [ ] **Check no default passwords** exist
- [ ] **Verify CORS settings**
- [ ] **Check file permissions**:
  ```bash
  chmod 750 /var/www/big-office
  chmod 640 /var/www/big-office/.env
  chmod 600 /var/www/big-office/data/tenders.db
  ```

---

## 📊 Monitoring Setup (Recommended)

### Application Monitoring
```bash
# PM2 Plus (free tier)
pm2 plus

# Or setup custom monitoring
npm install winston
```

### Server Monitoring
- **Netdata**: Real-time server monitoring
- **Grafana**: Visual dashboards
- **Prometheus**: Metrics collection

### Uptime Monitoring
- **UptimeRobot**: Free uptime monitoring
- **Pingdom**: Advanced monitoring

### Error Tracking
```bash
# Sentry.io integration
npm install @sentry/node
```

---

## 🆘 Troubleshooting

### Application won't start
```bash
# Check Node.js version
node --version  # Should be v16+

# Check port availability
sudo lsof -i :3000

# Check logs
pm2 logs big-office --lines 50

# Restart
pm2 restart big-office
```

### Database errors
```bash
# Check database file exists
ls -lh /var/www/big-office/data/tenders.db

# Check permissions
sudo chown -R $USER:$USER /var/www/big-office/data

# Verify database integrity
sqlite3 /var/www/big-office/data/tenders.db "PRAGMA integrity_check;"
```

### Nginx errors
```bash
# Test configuration
sudo nginx -t

# Check error logs
sudo tail -f /var/log/nginx/error.log

# Restart Nginx
sudo systemctl restart nginx
```

### SSL certificate issues
```bash
# Renew certificate
sudo certbot renew

# Test renewal
sudo certbot renew --dry-run
```

---

## 📝 Ongoing Maintenance

### Daily
- [ ] Check PM2 status: `pm2 status`
- [ ] Monitor disk space: `df -h`
- [ ] Review error logs

### Weekly
- [ ] Check backup status
- [ ] Review access logs
- [ ] Monitor memory usage
- [ ] Test critical features

### Monthly
- [ ] Update dependencies: `npm audit` and `npm update`
- [ ] Review and delete old backups
- [ ] Check SSL certificate expiry
- [ ] Security audit
- [ ] Performance optimization
- [ ] User feedback review

---

## 🎉 Deployment Complete!

Your Big Office system is now production-ready with:
- ✅ Secure authentication
- ✅ SSL encryption
- ✅ Automated backups
- ✅ Process management (PM2)
- ✅ Reverse proxy (Nginx)
- ✅ Monitoring setup
- ✅ All features tested

**Access your system at**: https://yourdomain.com

**Support**: Keep this checklist for reference and regular maintenance.
