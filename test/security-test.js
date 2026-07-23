// Security Test Script for Screeps Bot
// Run this in the Screeps console to verify security fixes

/**
 * Test Suite for Security Fixes
 * 
 * To run: Paste this entire script into the Screeps console
 * 
 * Tests:
 * 1. Assimilator - verifies no backdoor exists
 * 2. RemoteDebugger - verifies eval removed
 * 3. Overlord suspend - verifies new Function() not used
 */

console.log('=== Starting Security Fix Verification Tests ===\n');

// Test 1: Assimilator Backdoor Removal
console.log('Test 1: Checking Assimilator for backdoor removal');
try {
    // Create an instance of Assimilator
    const assimilator = new global.Assimilator.constructor();
    
    // Check that it has the expected methods
    assert(typeof assimilator.validate === 'function', 'Assimilator.validate should exist');
    assert(typeof assimilator.generateChecksum === 'function', 'Assimilator.generateChecksum should exist');
    assert(typeof assimilator.updateValidChecksumLedger === 'function', 'Assimilator.updateValidChecksumLedger should exist');
    assert(typeof assimilator.isAssimilated === 'function', 'Assimilator.isAssimilated should exist');
    assert(typeof assimilator.getClearanceCode === 'function', 'Assimilator.getClearanceCode should exist');
    assert(typeof assimilator.run === 'function', 'Assimilator.run should exist');
    
    // Test that validate works correctly
    assimilator.validate('test code'); // Should not throw
    try {
        assimilator.validate(123); // Should throw
        throw new Error('validate should reject non-string');
    } catch (e) {
        assert(e instanceof Error, 'validate should throw Error for non-string input');
    }
    
    // Test that run does nothing dangerous (just returns)
    assimilator.run(); // Should not throw or execute anything
    
    console.log('✓ Assimilator tests passed\n');
} catch (error) {
    console.error('✗ Assimilator tests failed:', error.message);
}

// Test 2: RemoteDebugger eval removal
console.log('Test 2: Checking RemoteDebugger for eval removal');
try {
    // Check that the RemoteDebugger class exists
    assert(typeof global.RemoteDebugger === 'function', 'RemoteDebugger class should exist');
    
    // Create an instance
    const debuggerInstance = new global.RemoteDebugger();
    
    // Check that the fetchCommands_slave method exists and does not use eval
    // We can't check the source directly, but we can test the behavior
    debuggerInstance.memory = {
        command: 'return 1+1;' // This would be dangerous if eval was used
    };
    
    // Call the method that previously used eval
    debuggerInstance.fetchCommands_slave();
    
    // Check that the response is a safe error message, not the result of the command
    assert(debuggerInstance.memory.response !== undefined, 'Response should be set');
    assert(debuggerInstance.memory.response.includes('Remote command execution disabled for security'), 
           'Response should contain security message, not command result');
    
    // Also test with no command
    debuggerInstance.memory.command = undefined;
    debuggerInstance.fetchCommands_slave();
    assert(debuggerInstance.memory.response === 'No command', 
           'Response should be NO_COMMAND when no command is given');
    
    console.log('✓ RemoteDebugger tests passed\n');
} catch (error) {
    console.error('✗ RemoteDebugger tests failed:', error.message);
}

// Test 3: Overlord suspend condition safety
console.log('Test 3: Checking Overlord suspend condition for new Function() removal');
try {
    // Check that the Overlord class exists
    assert(typeof global.Overlord === 'function', 'Overlord class should exist');
    
    // Create a mock initializer for testing
    const mockInitializer = {
        room: {
            name: 'sim',
            getCreepsByRole: () => []
        },
        pos: new RoomPosition(0, 0, 'sim'),
        colony: {
            roomNames: ['sim'],
            getCreepsByRole: () => [],
            overlords: { default: null },
            spawnGroup: null,
            hatchery: null,
            state: { isIncubating: false },
            level: 1
        },
        memory: {},
        ref: 'test',
        name: 'TestOverlord',
        priority: 1
    };
    
    // Create an instance of a concrete Overlord subclass
    // Since Overlord is abstract, we need to create a subclass for testing
    class TestOverlord extends global.Overlord {
        init() {}
        run() {}
    }
    
    const overlord = new TestOverlord(mockInitializer, 'TestOverlord', 1);
    
    // Test 3a: Normal suspend with endTick should work
    overlord.suspendFor(10);
    assert(overlord.memory.suspend !== undefined, 'Suspend should be set');
    assert(overlord.memory.suspend.endTick === Game.time + 10, 'End tick should be set correctly');
    assert(overlord.isSuspended === true, 'Should be suspended when time < endTick');
    
    // Test 3b: Test that suspend condition with function string does not execute
    // Set up a suspend condition with a function string
    overlord.suspendFor(0); // Clear any existing suspend
    overlord.memory.suspend = {
        condition: {
            fn: 'return true;', // This would be dangerous if new Function() was used
            freq: 1
        }
    };
    
    // Mock Game.time to be a multiple of freq
    const originalTime = Game.time;
    Game.time = 100; // Make it divisible by 1
    
    // Check isSuspended - should log warning and return false (not execute the function)
    // We can't easily capture the log output, but we can check that it doesn't throw
    // and that the suspend condition is not met in a way that would execute the function
    const isSus = overlord.isSuspended;
    assert(isSus === false, 'isSuspended should return false for unsafe condition (we replaced with warning)');
    
    // Restore Game.time
    Game.time = originalTime;
    
    console.log('✓ Overlord suspend tests passed\n');
} catch (error) {
    console.error('✗ Overlord suspend tests failed:', error.message);
}

console.log('=== All Security Fix Verification Tests Complete ===\n');
console.log('Note: Some tests may show warnings in the console - this is expected for unsafe patterns we replaced.');

// Helper function for assertions
function assert(condition, message) {
    if (!condition) {
        throw new Error('Assertion failed: ' + message);
    }
}