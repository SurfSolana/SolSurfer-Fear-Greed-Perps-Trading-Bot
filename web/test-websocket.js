/**
 * Simple test script to verify WebSocket server functionality
 */

const WebSocket = require('ws');

console.log('Testing WebSocket connection to localhost:3001...');

// Test connection
const ws = new WebSocket('ws://localhost:3001');

ws.on('open', function open() {
  console.log('✅ WebSocket connection established');
  
  // Send a ping
  ws.send(JSON.stringify({
    type: 'ping',
    data: {},
    timestamp: Date.now()
  }));
  
  setTimeout(() => {
    ws.close();
    console.log('Test completed successfully');
  }, 2000);
});

ws.on('message', function message(data) {
  try {
    const msg = JSON.parse(data.toString());
    console.log('📨 Received message:', msg.type);
  } catch (e) {
    console.log('📨 Received:', data.toString());
  }
});

ws.on('error', function error(err) {
  console.error('❌ WebSocket error:', err.message);
});

ws.on('close', function close() {
  console.log('🔌 WebSocket connection closed');
});

// Timeout fallback
setTimeout(() => {
  if (ws.readyState !== WebSocket.OPEN) {
    console.log('⚠️  WebSocket server might not be running on port 3001');
    console.log('   Start the Next.js development server first');
  }
}, 3000);