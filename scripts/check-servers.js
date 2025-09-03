/**
 * Script to check if all servers are running
 */

const http = require('http');

function checkServer(url, name) {
  return new Promise((resolve) => {
    const request = http.get(url, (res) => {
      console.log(`✅ ${name} is running (${url}) - Status: ${res.statusCode}`);
      resolve(true);
    });
    
    request.on('error', (err) => {
      console.log(`❌ ${name} is NOT running (${url}) - Error: ${err.message}`);
      resolve(false);
    });
    
    request.setTimeout(3000, () => {
      console.log(`⏰ ${name} timeout (${url})`);
      request.destroy();
      resolve(false);
    });
  });
}

async function checkAllServers() {
  console.log('🔍 Checking server status...\n');
  
  const checks = await Promise.all([
    checkServer('http://localhost:3001', 'Dapp'),
    checkServer('http://localhost:9012', 'Sybil Slayer')
  ]);
  
  const allRunning = checks.every(Boolean);
  
  console.log('\n📊 Summary:');
  if (allRunning) {
    console.log('🎉 All servers are running!');
    console.log('🚀 Ready for Pusher testing');
    console.log('\nNext steps:');
    console.log('1. Open: http://localhost:3001/games/sybil-slayer');
    console.log('2. Login and start playing');
    console.log('3. Check DevTools console for Pusher logs');
  } else {
    console.log('⚠️  Some servers are not running');
    console.log('Please start them:');
    console.log('• Dapp: pnpm dapp dev');
    console.log('• Sybil Slayer: pnpm sybil-slayer dev');
  }
}

checkAllServers();