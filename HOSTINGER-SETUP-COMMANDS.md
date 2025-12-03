# 🚀 Hostinger Setup Commands

## After Uploading Files

### Step 1: Access Terminal in hPanel
1. Go to https://hpanel.hostinger.com/
2. Click **Advanced** → **Terminal** (or SSH Access)
3. Click **Launch Terminal**

### Step 2: Navigate to Your Application Directory

```bash
# Find your application directory (usually one of these):
cd ~/domains/yourdomain.com/public_html
# OR
cd ~/public_html
# OR
cd ~/htdocs

# Verify files are there
ls -la
```

### Step 3: Install Dependencies

```bash
# Install Node.js packages
npm install --production

# If you get permission errors, try:
npm install --production --unsafe-perm
```

### Step 4: Initialize Database

```bash
# Create database with schema
npm run init-db

# Verify database was created
ls -lh data/tenders.db
```

### Step 5: Configure Environment

```bash
# Edit .env file
nano .env

# Update these values:
# NODE_ENV=production
# SESSION_SECRET=change-this-to-random-string-xyz123
# Save: Ctrl+X, then Y, then Enter
```

### Step 6: Set File Permissions

```bash
# Make files secure
chmod 600 .env
chmod 600 data/tenders.db
chmod 644 server.js
```

### Step 7: Enable Node.js in hPanel

**Via hPanel UI:**
1. Go to **Advanced** → **Node.js**
2. Click **Create Application**
3. Configure:
   - **Node.js Version**: 18.x or 20.x (LTS)
   - **Application Mode**: Production
   - **Application Root**: /domains/yourdomain.com/public_html
   - **Application Startup File**: server.js
   - **Port**: (auto-assigned)
4. Click **Create**

### Step 8: Start Application

```bash
# Via terminal (if available)
npm start

# Or use PM2 (if installed)
pm2 start server.js --name big-office
pm2 save
```

**OR via hPanel:**
- Go to **Advanced** → **Node.js**
- Find your application
- Click **Restart** or **Start**
- Check status: Should show "Running"

### Step 9: Setup SSL Certificate

**Via hPanel:**
1. Go to **Security** → **SSL**
2. Select your domain
3. Choose **Free SSL** (Let's Encrypt)
4. Click **Install**
5. Wait 5-15 minutes
6. Enable **Force HTTPS**

### Step 10: Verify Deployment

```bash
# Check if application is running
ps aux | grep node

# Check logs
tail -f logs/*.log
# OR
pm2 logs big-office
```

**Test in browser:**
- Visit: https://yourdomain.com
- Login: admin / demo123

---

## 🔧 Troubleshooting Commands

### If Application Won't Start:

```bash
# Check Node.js version
node --version
npm --version

# Check for errors
npm start
# Look for error messages

# Check database
sqlite3 data/tenders.db "SELECT COUNT(*) FROM users;"
```

### If Port is Already in Use:

```bash
# Kill existing Node processes
pkill -f node

# Or find specific process
ps aux | grep node
kill -9 [PID]
```

### If Dependencies Fail:

```bash
# Clear cache and reinstall
rm -rf node_modules
npm cache clean --force
npm install --production
```

### Check Application Logs:

```bash
# View logs
ls -la logs/
cat logs/error.log
cat logs/output.log

# Live log monitoring
tail -f logs/error.log
```

### Database Issues:

```bash
# Check database file
ls -lh data/tenders.db

# Test database
sqlite3 data/tenders.db
.tables
SELECT * FROM users;
.quit

# Reinitialize if needed
rm data/tenders.db
npm run init-db
```

---

## 🎯 Quick Commands Reference

```bash
# Navigate to app
cd ~/domains/yourdomain.com/public_html

# Install packages
npm install --production

# Initialize database
npm run init-db

# Start app
npm start

# Check status
ps aux | grep node

# View logs
tail -f logs/*.log

# Restart app (via PM2)
pm2 restart big-office

# Stop app
pkill -f node
```

---

## ✅ Post-Deployment Checklist

After running commands above:

- [ ] Files uploaded successfully
- [ ] Dependencies installed (npm install)
- [ ] Database initialized (npm run init-db)
- [ ] .env file configured
- [ ] File permissions set
- [ ] Node.js app created in hPanel
- [ ] Application started and running
- [ ] SSL certificate installed
- [ ] Application accessible via domain
- [ ] Can login successfully
- [ ] All features working

---

## 🆘 Need Help?

**Common Issues:**

1. **"Cannot find module"** → Run `npm install`
2. **"Port already in use"** → Kill existing Node process
3. **"Database locked"** → Check file permissions
4. **"502 Bad Gateway"** → Restart application in hPanel

**Hostinger Support:**
- 24/7 Live Chat in hPanel
- https://support.hostinger.com
- Email: support@hostinger.com

---

## 🎉 Success!

Once you see:
```
Big Office running on port XXXX
Database connected successfully
```

Your application is live! 🚀

Visit: https://yourdomain.com
Login: admin / demo123

**⚠️ IMPORTANT: Change default passwords immediately!**

---

**Last Updated**: December 4, 2025
