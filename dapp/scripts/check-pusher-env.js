/**
 * Script to check Pusher environment configuration
 * Run with: node scripts/check-pusher-env.js
 */

const fs = require('fs');
const path = require('path');

const ENV_FILE = path.join(__dirname, '..', '.env.local');

console.log('🔍 Checking Pusher environment configuration...\n');

// Check if .env.local exists
if (!fs.existsSync(ENV_FILE)) {
  console.log('❌ .env.local file not found');
  console.log('📝 Please create .env.local with your Pusher credentials:\n');
  
  console.log('# Pusher Configuration');
  console.log('NEXT_PUBLIC_PUSHER_KEY=your_pusher_app_key');
  console.log('NEXT_PUBLIC_PUSHER_CLUSTER=us2');
  console.log('PUSHER_APP_ID=your_pusher_app_id');
  console.log('PUSHER_KEY=your_pusher_app_key');
  console.log('PUSHER_SECRET=your_pusher_app_secret');
  console.log('PUSHER_CLUSTER=us2\n');
  
  console.log('🔗 Get credentials from: https://dashboard.pusher.com');
  process.exit(1);
}

// Load environment variables
require('dotenv').config({ path: ENV_FILE });

const requiredVars = [
  'NEXT_PUBLIC_PUSHER_KEY',
  'NEXT_PUBLIC_PUSHER_CLUSTER', 
  'PUSHER_APP_ID',
  'PUSHER_KEY',
  'PUSHER_SECRET',
  'PUSHER_CLUSTER'
];

let allGood = true;

console.log('📋 Checking required variables:\n');

requiredVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    console.log(`✅ ${varName}: ${varName.includes('SECRET') ? '***hidden***' : value}`);
  } else {
    console.log(`❌ ${varName}: MISSING`);
    allGood = false;
  }
});

console.log('\n');

if (allGood) {
  console.log('🎉 All Pusher environment variables are configured!');
  console.log('🧪 Run: node scripts/test-pusher-connection.js');
} else {
  console.log('⚠️  Some variables are missing. Please add them to .env.local');
}