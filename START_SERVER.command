#!/bin/bash

# SLA LINE Bot Server Launcher for macOS
# Double-click this file to start the server

cd "$(dirname "$0")"

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                                                            ║"
echo "║         🤖 SLA LINE Bot Server Launcher                   ║"
echo "║                                                            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo ""
    echo "Please install Node.js from: https://nodejs.org/"
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi

echo "✅ Node.js found: $(node -v)"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo ""
    echo "📦 Installing dependencies (first time only)..."
    npm install
    echo ""
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo ""
    echo "⚠️  Creating .env file from template..."
    cp .env.example .env
    echo "✅ .env file created"
fi

echo ""
echo "🚀 Starting LINE Bot Server..."
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Start the server
node server.js

# Keep terminal open on error
read -p "Press Enter to exit..."
