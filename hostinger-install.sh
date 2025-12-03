#!/bin/bash

# Hostinger Post-Deployment Setup Script
# Run this after Git deployment to kormopro.com

echo "🚀 Setting up Big Office on kormopro.com..."
echo "==========================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Are you in the right directory?"
    echo "Run: cd ~/domains/kormopro.com/public_html"
    exit 1
fi

echo "📦 Installing dependencies..."
npm install --production

if [ $? -ne 0 ]; then
    echo "❌ npm install failed!"
    exit 1
fi

echo ""
echo "🗄️  Initializing database..."
npm run init-db

if [ $? -ne 0 ]; then
    echo "❌ Database initialization failed!"
    exit 1
fi

echo ""
echo "🔒 Setting file permissions..."
chmod 600 .env 2>/dev/null || echo "⚠️  .env not found (create it later)"
chmod 600 data/tenders.db
chmod 755 public/

echo ""
echo "✅ Installation complete!"
echo ""
echo "==========================================="
echo "🎯 Next Steps:"
echo "==========================================="
echo ""
echo "1. Create .env file:"
echo "   nano .env"
echo "   Add:"
echo "   NODE_ENV=production"
echo "   SESSION_SECRET=$(openssl rand -hex 32)"
echo ""
echo "2. Change default passwords:"
echo "   sqlite3 data/tenders.db"
echo "   UPDATE users SET password='newpassword' WHERE username='admin';"
echo ""
echo "3. Start application via hPanel:"
echo "   - Go to Advanced → Node.js"
echo "   - Select your app and click 'Restart'"
echo ""
echo "4. Enable SSL:"
echo "   - Go to Security → SSL"
echo "   - Install Free SSL (Let's Encrypt)"
echo ""
echo "🌐 Your site: https://kormopro.com"
echo "👤 Default login: admin / demo123 (CHANGE THIS!)"
echo ""
echo "==========================================="
