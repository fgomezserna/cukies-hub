/**
 * Script to check Pusher environment configuration for Sybil Slayer
 * Run with: node scripts/check-pusher-env.js
 */

const fs = require('fs');
const path = require('path');

const ENV_FILE = path.join(__dirname, '..', '.env.local');

console.log('🎮 Checking Sybil Slayer Pusher environment configuration...\n');

// Check if .env.local exists
if (!fs.existsSync(ENV_FILE)) {
  console.log('❌ .env.local file not found in games/sybil-slayer/');
  console.log('📝 Please create .env.local with your Pusher credentials:\n');
  
  console.log('# Pusher Configuration for Sybil Slayer');
  console.log('NEXT_PUBLIC_PUSHER_KEY=your_pusher_app_key');
  console.log('NEXT_PUBLIC_PUSHER_CLUSTER=eu');
  console.log('NEXT_PUBLIC_PARENT_URL=http://localhost:3000');
  console.log();
  
  process.exit(1);
}

// Load environment variables
require('dotenv').config({ path: ENV_FILE });

const requiredVars = [
  'NEXT_PUBLIC_PUSHER_KEY',
  'NEXT_PUBLIC_PUSHER_CLUSTER'
];

const optionalVars = [
  'NEXT_PUBLIC_PARENT_URL'
];

let allGood = true;

console.log('📋 Checking required variables:\n');

requiredVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    console.log(`✅ ${varName}: ${value}`);
  } else {
    console.log(`❌ ${varName}: MISSING`);
    allGood = false;
  }
});

console.log('\n📋 Checking optional variables:\n');

optionalVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    console.log(`✅ ${varName}: ${value}`);
  } else {
    console.log(`⚠️  ${varName}: NOT SET (will use default)`);
  }
});

console.log('\n');

if (allGood) {
  console.log('🎉 Sybil Slayer Pusher configuration looks good!');
  console.log('🚀 Ready to test game-to-dapp communication');
} else {
  console.log('⚠️  Some required variables are missing. Please add them to .env.local');
}