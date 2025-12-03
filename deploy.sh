#!/bin/bash

# Big Office - Quick Production Setup Script
# Run with: bash deploy.sh

echo "🚀 Big Office Deployment Script"
echo "================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js v16+ first."
    exit 1
fi

echo "✅ Node.js version: $(node --version)"

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed."
    exit 1
fi

echo "✅ npm version: $(npm --version)"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install --production

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed"
echo ""

# Check if database exists
if [ ! -f "data/tenders.db" ]; then
    echo "🗄️  Initializing database..."
    npm run init-db
    
    if [ $? -ne 0 ]; then
        echo "❌ Failed to initialize database"
        exit 1
    fi
    
    echo "✅ Database initialized"
    
    # Ask about demo data
    read -p "📊 Load demo data? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        node seed-demo-data.js
        echo "✅ Demo data loaded"
    fi
else
    echo "✅ Database already exists"
fi

echo ""

# Check if PM2 is installed
if command -v pm2 &> /dev/null; then
    echo "🔄 Starting with PM2..."
    pm2 start ecosystem.config.js
    pm2 save
    echo "✅ Application started with PM2"
    echo ""
    echo "📊 Monitor with: pm2 monit"
    echo "📝 View logs with: pm2 logs big-office"
    echo "🔄 Restart with: pm2 restart big-office"
else
    echo "⚠️  PM2 not installed. Starting in regular mode..."
    echo "💡 Install PM2 for production: npm install -g pm2"
    npm start &
    echo "✅ Application started"
fi

echo ""
echo "================================"
echo "🎉 Deployment Complete!"
echo "================================"
echo ""
echo "📍 Access your application at: http://localhost:3000"
echo ""
echo "🔐 Default Login Credentials:"
echo "   Admin:   admin / demo123"
echo "   Manager: manager / demo123"
echo "   User:    accounts / demo123"
echo ""
echo "⚠️  IMPORTANT: Change default passwords before production use!"
echo ""
echo "📖 See DEPLOYMENT.md for:"
echo "   - SSL/HTTPS setup"
echo "   - Password hashing"
echo "   - Nginx configuration"
echo "   - Security hardening"
echo ""
echo "✅ Ready to go!"
