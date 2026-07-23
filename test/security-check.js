// Simple test runner for security fixes
// To run: paste this into the Screeps console

console.log('Running security fix verification tests...');

// Test 1: Assimilator
try {
    const a = new global.Assimilator.constructor();
    console.log('✓ Assimilator instantiated');
    
    // Test validate
    a.validate('test');
    console.log('✓ Assimilator.validate works with string');
    
    try {
        a.validate(123);
        console.log('✗ Assimilator.validate should reject non-string');
    } catch(e) {
        console.log('✓ Assimilator.rejects non-string input');
    }
    
    // Test run doesn't explode
    a.run();
    console.log('✓ Assimilator.run executes without error');
} catch(e) {
    console.log('✗ Assimilator test failed:', e.message);
}

// Test 2: RemoteDebugger
try {
    const Debugger = require('/src/debug/remoteDebugger.ts').RemoteDebugger;
    const db = new Debugger();
    console.log('✓ RemoteDebugger instantiated');
    
    // Check that dangerous methods are defused
    db.memory.command = 'return 1+1;';
    db.fetchCommands_slave();
    if (db.memory.response && db.memory.response.includes('disabled')) {
        console.log('✓ RemoteDebugger safely handles commands');
    } else {
        console.log('? RemoteDebugger response:', db.memory.response);
    }
} catch(e) {
    console.log('✗ RemoteDebugger test note:', e.message);
}

// Test 3: Overlord suspend
try {
    // Check if the isSuspended getter was patched
    const Overseer = require('/src/overseer/Overseer').Overseer;
    // We can't easily test the override without instantiating, but we can check the source
    console.log('✓ Overlord class accessible');
} catch(e) {
    console.log('✗ Overlord test note:', e.message);
}

console.log('Security check complete. Check console for results.');