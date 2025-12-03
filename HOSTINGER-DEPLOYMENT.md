# 🚀 Hostinger Deployment Guide - Big Office v2.0.0

## 📋 Prerequisites

### What You Need
- ✅ Hostinger account with Node.js hosting plan
- ✅ Domain name (optional, can use Hostinger subdomain)
- ✅ FTP/SFTP client (FileZilla recommended) OR Git access
- ✅ SSH access (usually included with Business/Cloud plans)

### Recommended Hostinger Plans
- **Premium Hosting**: Basic Node.js support
- **Business Hosting**: Better for production (recommended)
- **Cloud Hosting**: Best performance and scalability

---

## 🎯 Step-by-Step Hostinger Deployment

### Step 1: Prepare Your Application Locally

```bash
# Navigate to your project
cd "/Users/sbmac/e-GP Tender Summary Builder"

# Create production build
npm install --production

# Test locally first
npm start
# Verify at http://localhost:3000
```

### Step 2: Setup Hostinger Environment

#### A. Login to hPanel
1. Go to https://hpanel.hostinger.com/
2. Login with your credentials
3. Select your hosting plan

#### B. Enable Node.js
1. In hPanel, go to **Advanced** → **Node.js**
2. Click **"Create Application"**
3. Configure:
   - **Application Root**: `/domains/yourdomain.com/public_html` (or custom path)
   - **Application URL**: Choose your domain or subdomain
   - **Node.js Version**: Select **18.x** or **20.x** (latest LTS)
   - **Application Mode**: **Production**
   - **Application Startup File**: `server.js`
   - **Port**: Will be auto-assigned by Hostinger

4. Click **Create**

### Step 3: Upload Files via FTP/SFTP

#### Option A: Using FileZilla (Recommended for beginners)

1. **Get FTP Credentials** from hPanel:
   - Go to **Files** → **FTP Accounts**
   - Note: Hostname, Username, Password, Port

2. **Connect via FileZilla**:
   - Host: `ftp.yourdomain.com`
   - Username: Your FTP username
   - Password: Your FTP password
   - Port: 21 (FTP) or 22 (SFTP)

3. **Upload Files**:
   - Navigate to your application folder (usually `/domains/yourdomain.com/public_html`)
   - Upload these files/folders:
     ```
     ├── server.js
     ├── package.json
     ├── init-db.js
     ├── seed-demo-data.js (optional for demo)
     ├── alert-generator.js
     ├── schema.sql
     ├── data/
     ├── public/
     └── node_modules/ (optional - better to install on server)
     ```

#### Option B: Using Git (Recommended for advanced users)

1. **Enable SSH** in hPanel (if available)
2. **Connect via SSH**:
   ```bash
   ssh username@yourdomain.com -p 65002
   ```

3. **Clone or Upload**:
   ```bash
   cd /home/username/domains/yourdomain.com/public_html
   
   # Option 1: If you have Git repo
   git clone your-repo-url .
   
   # Option 2: Upload via SCP
   # From local machine:
   scp -P 65002 -r "/Users/sbmac/e-GP Tender Summary Builder/"* username@yourdomain.com:/home/username/domains/yourdomain.com/public_html/
   ```

### Step 4: Install Dependencies via SSH

```bash
# Connect to SSH
ssh username@yourdomain.com -p 65002

# Navigate to app directory
cd /home/username/domains/yourdomain.com/public_html

# Install dependencies
npm install --production

# Initialize database
npm run init-db

# Optional: Load demo data (remove in production)
node seed-demo-data.js
```

### Step 5: Configure Application for Hostinger

#### Create .htaccess file (if needed)
Create `.htaccess` in your public_html folder:

```apache
# Force HTTPS
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

# Node.js specific
PassengerEnabled On
PassengerAppRoot /home/username/domains/yourdomain.com/public_html
PassengerBaseURI /
PassengerAppType node
PassengerStartupFile server.js
```

#### Update server.js for Hostinger

The port is usually assigned by Hostinger. Update your server.js:

```javascript
// At the end of server.js, change:
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Big Office running on port ${PORT}`);
});
```

### Step 6: Setup Environment Variables

#### Via hPanel UI:
1. Go to **Advanced** → **Node.js**
2. Select your application
3. Click **Edit**
4. Add environment variables:
   ```
   NODE_ENV=production
   SESSION_SECRET=your-super-secret-key-change-this
   ```

#### Or create .env file via SSH:
```bash
cat > .env << 'EOF'
NODE_ENV=production
PORT=3000
SESSION_SECRET=change-this-to-random-string
DATABASE_PATH=./data/tenders.db
EOF

chmod 600 .env
```

### Step 7: Start Application

#### Via hPanel:
1. Go to **Advanced** → **Node.js**
2. Select your application
3. Click **Restart** or **Start**
4. Check **Status** - should show "Running"

#### Or via SSH:
```bash
# Using npm
npm start

# Or using pm2 (if available)
pm2 start server.js --name big-office
pm2 save
```

### Step 8: Setup Database Backups

Create backup script via SSH:

```bash
# Create backup directory
mkdir -p /home/username/backups

# Create backup script
cat > /home/username/backup-db.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
cp /home/username/domains/yourdomain.com/public_html/data/tenders.db /home/username/backups/tenders_$DATE.db
# Keep only last 30 days
find /home/username/backups -name "tenders_*.db" -mtime +30 -delete
EOF

chmod +x /home/username/backup-db.sh

# Add to crontab (via hPanel → Advanced → Cron Jobs)
# Schedule: Daily at 2 AM
# Command: /home/username/backup-db.sh
```

### Step 9: Setup SSL Certificate

#### Via hPanel (Free SSL):
1. Go to **Security** → **SSL**
2. Select your domain
3. Choose **Free SSL** (Let's Encrypt)
4. Click **Install**
5. Wait 5-15 minutes for activation

#### Force HTTPS:
Already configured in .htaccess above, or in hPanel:
1. **Security** → **Force HTTPS**
2. Toggle **ON**

---

## 🔒 Security Configuration for Hostinger

### 1. Change Default Passwords

```bash
# Connect via SSH
ssh username@yourdomain.com -p 65002

cd /home/username/domains/yourdomain.com/public_html

# Access database
sqlite3 data/tenders.db

# Change passwords (after implementing bcrypt)
UPDATE users SET password = 'new-hashed-password' WHERE username = 'admin';
UPDATE users SET password = 'new-hashed-password' WHERE username = 'manager';
UPDATE users SET password = 'new-hashed-password' WHERE username = 'accounts';

.quit
```

### 2. Secure File Permissions

```bash
# Set proper permissions
chmod 755 /home/username/domains/yourdomain.com/public_html
chmod 644 /home/username/domains/yourdomain.com/public_html/server.js
chmod 600 /home/username/domains/yourdomain.com/public_html/.env
chmod 600 /home/username/domains/yourdomain.com/public_html/data/tenders.db
```

### 3. Setup Firewall Rules (via hPanel)
1. **Security** → **Firewall**
2. Allow ports: 80 (HTTP), 443 (HTTPS)
3. Block direct access to port 3000

---

## 🐛 Troubleshooting on Hostinger

### Application Won't Start

```bash
# Check logs
cd /home/username/domains/yourdomain.com/public_html
cat logs/error.log
cat logs/output.log

# Check Node.js status in hPanel
# Advanced → Node.js → View application status

# Restart application
# Via hPanel: Node.js → Restart
# Or SSH:
pm2 restart all
```

### Database Connection Issues

```bash
# Verify database exists
ls -lh data/tenders.db

# Check permissions
chmod 644 data/tenders.db

# Test database
sqlite3 data/tenders.db "SELECT COUNT(*) FROM firms;"
```

### Port Conflicts

Hostinger assigns ports automatically. Check your application logs:
```bash
tail -f /var/log/passenger.log
```

### Memory Issues

Hostinger plans have memory limits:
- Premium: 1GB
- Business: 2GB
- Cloud: 3GB+

If hitting limits:
```bash
# Optimize Node.js memory
node --max-old-space-size=512 server.js
```

---

## 📊 Performance Optimization for Hostinger

### 1. Enable Caching

Add to .htaccess:
```apache
# Browser Caching
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType image/jpg "access plus 1 year"
  ExpiresByType image/jpeg "access plus 1 year"
  ExpiresByType image/gif "access plus 1 year"
  ExpiresByType image/png "access plus 1 year"
  ExpiresByType text/css "access plus 1 month"
  ExpiresByType application/javascript "access plus 1 month"
</IfModule>
```

### 2. Enable Gzip Compression

```apache
# Gzip Compression
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css text/javascript application/javascript
</IfModule>
```

### 3. Database Optimization

```bash
# Run weekly via cron
sqlite3 data/tenders.db "VACUUM;"
sqlite3 data/tenders.db "ANALYZE;"
```

---

## 🔍 Monitoring on Hostinger

### Via hPanel Dashboard:
1. **Metrics** → View CPU, Memory, Bandwidth usage
2. **Files** → Check disk space
3. **Node.js** → Monitor application status

### Via SSH:
```bash
# Check application status
pm2 status

# Monitor logs
pm2 logs big-office

# Check resource usage
top
df -h
free -m
```

### Setup Uptime Monitoring:
Use external services:
- **UptimeRobot** (free): https://uptimerobot.com
- **Pingdom**: https://www.pingdom.com
- **StatusCake**: https://www.statuscake.com

---

## 📱 Access Your Application

After successful deployment:

- **Your Domain**: https://yourdomain.com
- **Hostinger Subdomain**: https://yoursubdomain.hostinger.site

**Login with**:
- Admin: admin / demo123 (⚠️ Change in production!)
- Manager: manager / demo123
- User: accounts / demo123

---

## ✅ Hostinger Deployment Checklist

- [ ] Hostinger account with Node.js enabled
- [ ] Domain configured (or using subdomain)
- [ ] Files uploaded via FTP/Git
- [ ] Dependencies installed (`npm install`)
- [ ] Database initialized (`npm run init-db`)
- [ ] Environment variables configured
- [ ] Application started and running
- [ ] SSL certificate installed
- [ ] Default passwords changed
- [ ] Backup cron job configured
- [ ] Monitoring setup
- [ ] Application tested and working

---

## 💡 Hostinger-Specific Tips

1. **Node.js Version**: Always use LTS version (18.x or 20.x)
2. **File Upload**: Use SFTP (port 22) instead of FTP (port 21) for security
3. **Database**: SQLite works perfectly on Hostinger shared hosting
4. **Logs**: Check `/var/log/passenger.log` for errors
5. **Restart**: Use hPanel to restart when code changes
6. **Cron Jobs**: Setup via hPanel → Advanced → Cron Jobs
7. **Email**: Use Hostinger SMTP for email alerts (if needed)

---

## 🆘 Getting Help

### Hostinger Support:
- **24/7 Live Chat**: Available in hPanel
- **Knowledge Base**: https://support.hostinger.com
- **Email**: support@hostinger.com

### Application Issues:
- Check application logs in hPanel
- Review error logs via SSH
- Verify file permissions
- Test database connectivity

---

## 🎉 Deployment Complete!

Your Big Office system is now live on Hostinger!

**Next Steps**:
1. Test all features thoroughly
2. Change default passwords
3. Setup backups
4. Configure monitoring
5. Train your users

**Your application is ready to use!** 🚀

---

**Need help?** Contact Hostinger support or review the troubleshooting section above.

**Version**: 2.0.0  
**Platform**: Hostinger  
**Last Updated**: December 4, 2025
