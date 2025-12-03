#!/bin/bash

# Quick Hostinger Deployment Preparation Script
# Run this locally before uploading to Hostinger

echo "🚀 Preparing Big Office for Hostinger Deployment"
echo "================================================="
echo ""

# Create deployment package directory
DEPLOY_DIR="big-office-hostinger-deploy"
echo "📦 Creating deployment package..."

if [ -d "$DEPLOY_DIR" ]; then
    rm -rf "$DEPLOY_DIR"
fi

mkdir -p "$DEPLOY_DIR"

# Copy essential files only
echo "📋 Copying files..."
cp server.js "$DEPLOY_DIR/"
cp package.json "$DEPLOY_DIR/"
cp init-db.js "$DEPLOY_DIR/"
cp alert-generator.js "$DEPLOY_DIR/"
cp schema.sql "$DEPLOY_DIR/"
cp .env.example "$DEPLOY_DIR/.env"

# Copy directories
cp -r public "$DEPLOY_DIR/"
mkdir -p "$DEPLOY_DIR/data"

# Create .htaccess for Hostinger
echo "⚙️  Creating .htaccess..."
cat > "$DEPLOY_DIR/.htaccess" << 'EOF'
# Force HTTPS
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

# Node.js Configuration
PassengerEnabled On
PassengerAppRoot /home/username/domains/yourdomain.com/public_html
PassengerBaseURI /
PassengerAppType node
PassengerStartupFile server.js

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

# Gzip Compression
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css text/javascript application/javascript
</IfModule>

# Security Headers
<IfModule mod_headers.c>
  Header set X-XSS-Protection "1; mode=block"
  Header set X-Content-Type-Options "nosniff"
  Header set X-Frame-Options "SAMEORIGIN"
</IfModule>
EOF

# Create README for deployment
cat > "$DEPLOY_DIR/DEPLOY-INSTRUCTIONS.txt" << 'EOF'
HOSTINGER DEPLOYMENT INSTRUCTIONS
==================================

1. LOGIN TO HOSTINGER
   - Go to https://hpanel.hostinger.com/
   - Login with your credentials

2. ENABLE NODE.JS
   - Go to Advanced → Node.js
   - Create Application
   - Select Node.js 18.x or 20.x
   - Set Application Mode: Production
   - Set Startup File: server.js

3. UPLOAD FILES
   - Use FTP/SFTP or File Manager
   - Upload all files from this folder to:
     /domains/yourdomain.com/public_html/
   
   FTP Details (get from hPanel):
   - Host: ftp.yourdomain.com
   - Port: 21 (FTP) or 22 (SFTP)
   - Username: [from hPanel]
   - Password: [from hPanel]

4. CONNECT VIA SSH (if available)
   ssh username@yourdomain.com -p 65002
   
   Then run:
   cd /home/username/domains/yourdomain.com/public_html
   npm install --production
   npm run init-db

5. CONFIGURE ENVIRONMENT
   - Edit .env file with your settings
   - Change SESSION_SECRET to random string
   - Update NODE_ENV=production

6. START APPLICATION
   - Via hPanel: Node.js → Restart
   - Check status: Should show "Running"

7. SETUP SSL
   - Go to Security → SSL
   - Install Free SSL (Let's Encrypt)
   - Enable Force HTTPS

8. IMPORTANT SECURITY STEPS
   - Change default passwords immediately
   - Update .env with secure secrets
   - Setup automated backups
   - Test all features

9. ACCESS YOUR APPLICATION
   https://yourdomain.com
   
   Default login:
   - admin / demo123 (CHANGE THIS!)

10. NEED HELP?
    - Hostinger 24/7 Chat Support
    - See HOSTINGER-DEPLOYMENT.md for details

================================================
Ready to deploy! Upload these files to Hostinger.
================================================
EOF

# Create deployment checklist
cat > "$DEPLOY_DIR/CHECKLIST.txt" << 'EOF'
DEPLOYMENT CHECKLIST
====================

BEFORE UPLOADING:
[ ] Review .env file settings
[ ] Remove seed-demo-data.js (don't upload to production)
[ ] Verify .htaccess configuration

AFTER UPLOADING:
[ ] Files uploaded successfully
[ ] npm install completed
[ ] Database initialized (npm run init-db)
[ ] Application started in hPanel
[ ] SSL certificate installed
[ ] HTTPS working
[ ] Application accessible via domain

SECURITY:
[ ] Default passwords changed
[ ] .env file secured (chmod 600)
[ ] Database file secured (chmod 600)
[ ] Firewall configured

MONITORING:
[ ] Uptime monitoring setup
[ ] Backup cron job configured
[ ] Error logging working

TESTING:
[ ] Can login successfully
[ ] All modules working
[ ] Forms submit correctly
[ ] Search functionality works
[ ] Export to CSV works
[ ] Alerts generating

READY TO GO! ✓
EOF

# Create package info
echo ""
echo "✅ Deployment package created: $DEPLOY_DIR/"
echo ""
echo "📁 Package contents:"
ls -lh "$DEPLOY_DIR"
echo ""
echo "📊 Package size:"
du -sh "$DEPLOY_DIR"
echo ""
echo "================================================="
echo "🎯 NEXT STEPS:"
echo "================================================="
echo ""
echo "1. Review files in: $DEPLOY_DIR/"
echo ""
echo "2. Edit .env file with your settings:"
echo "   nano $DEPLOY_DIR/.env"
echo ""
echo "3. Upload to Hostinger via:"
echo "   - FileZilla (FTP/SFTP)"
echo "   - hPanel File Manager"
echo "   - SCP command"
echo ""
echo "4. Follow instructions in:"
echo "   $DEPLOY_DIR/DEPLOY-INSTRUCTIONS.txt"
echo ""
echo "5. See full guide:"
echo "   HOSTINGER-DEPLOYMENT.md"
echo ""
echo "================================================="
echo "✅ Ready to upload to Hostinger!"
echo "================================================="
