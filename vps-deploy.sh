#!/bin/bash

# Big Office VPS Deployment Script
# For Ubuntu/Debian VPS at 148.135.136.95

echo "🚀 Big Office VPS Deployment"
echo "=============================="
echo ""

# Update system
echo "📦 Updating system packages..."
apt update && apt upgrade -y

# Install Node.js 20.x
echo "📦 Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install Git
echo "📦 Installing Git..."
apt install -y git

# Install SQLite
echo "📦 Installing SQLite..."
apt install -y sqlite3

# Install PM2 globally
echo "📦 Installing PM2..."
npm install -g pm2

# Create application directory
echo "📁 Creating application directory..."
mkdir -p /var/www/big-office
cd /var/www/big-office

# Clone repository
echo "📥 Cloning repository..."
if [ -d ".git" ]; then
    git pull origin main
else
    git clone https://github.com/mahidulislamnakib/big-office.git .
fi

# Install dependencies
echo "📦 Installing application dependencies..."
npm install --production

# Initialize database
echo "🗄️  Initializing database..."
npm run init-db

# Create .env file
echo "⚙️  Creating environment configuration..."
cat > .env << 'ENVEOF'
NODE_ENV=production
PORT=3000
SESSION_SECRET=$(openssl rand -hex 32)
ENVEOF

# Set permissions
echo "🔒 Setting file permissions..."
chmod 600 .env
chmod 600 data/tenders.db

# Start application with PM2
echo "🚀 Starting application..."
pm2 delete big-office 2>/dev/null || true
pm2 start server.js --name big-office
pm2 save
pm2 startup

# Install Nginx
echo "📦 Installing Nginx..."
apt install -y nginx

# Configure Nginx
echo "⚙️  Configuring Nginx..."
cat > /etc/nginx/sites-available/big-office << 'NGINXEOF'
server {
    listen 80;
    server_name 148.135.136.95 kormopro.com www.kormopro.com;

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
NGINXEOF

ln -sf /etc/nginx/sites-available/big-office /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
nginx -t

# Restart Nginx
systemctl restart nginx
systemctl enable nginx

# Setup firewall
echo "🔥 Configuring firewall..."
ufw allow 22
ufw allow 80
ufw allow 443
ufw --force enable

# Install Certbot for SSL
echo "🔒 Installing Certbot..."
apt install -y certbot python3-certbot-nginx

echo ""
echo "✅ =============================================="
echo "✅  BIG OFFICE INSTALLATION COMPLETE!"
echo "✅ =============================================="
echo ""
echo "🌐 Your application is now running at:"
echo "   http://148.135.136.95"
echo "   http://kormopro.com (if DNS is configured)"
echo ""
echo "📊 PM2 Commands:"
echo "   pm2 status                 - Check status"
echo "   pm2 logs big-office        - View logs"
echo "   pm2 restart big-office     - Restart app"
echo "   pm2 stop big-office        - Stop app"
echo ""
echo "🔒 To enable HTTPS with Let's Encrypt:"
echo "   certbot --nginx -d kormopro.com -d www.kormopro.com"
echo ""
echo "⚠️  IMPORTANT SECURITY STEPS:"
echo "   1. Change default passwords in database"
echo "   2. Update .env with secure SESSION_SECRET"
echo "   3. Configure DNS to point to this server"
echo ""
echo "🗄️  Database location: /var/www/big-office/data/tenders.db"
echo ""
echo "✅ Deployment complete! 🎉"
