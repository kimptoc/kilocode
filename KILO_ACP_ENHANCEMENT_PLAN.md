# Kilo ACP Filesystem Enhancement Plan

## Objective

Enhance the native `kilo acp` command in the main kilocode repository to add filesystem capabilities (`fs/read_text_file` and `fs/write_text_file`) that are required by GitHub issue #922 but currently missing from the native implementation.

## Background Analysis

### Current State

- ✅ **Native `kilo acp` exists** with ACP v1 protocol compliance
- ✅ **Infrastructure present**: `AgentSideConnection` has `readTextFile()` and `writeTextFile()` methods
- ✅ **Permission system**: Sophisticated permission handling already implemented
- ❌ **Missing filesystem methods**: `fs/read_text_file` and `fs/write_text_file` not exposed as ACP protocol methods

### Testing Results

```bash
# This works (native ACP protocol)
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}}' | kilo acp

# This fails (filesystem capability missing)
echo '{"jsonrpc":"2.0","id":1,"method":"fs/read_text_file","params":{"path":"test.txt"}}' | kilo acp
# Returns: {"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"Method not found"}}
```

## Implementation Plan

### Repository Setup

1. **Target Repository**: `/Users/kimptoc/Projects/kilocode/`
2. **Primary File**: `packages/opencode/src/acp/agent.ts`
3. **Branch Strategy**: Create feature branch `feat/acp-filesystem-capabilities`

### Required Changes

#### 1. Add Filesystem Capability Declaration

**File**: `packages/opencode/src/acp/agent.ts`  
**Location**: Line ~541 in `initialize()` method  
**Change**: Add `fsCapabilities` to `agentCapabilities`

```typescript
agentCapabilities: {
  loadSession: true,
  mcpCapabilities: { http: true, sse: true },
  promptCapabilities: { embeddedContext: true, image: true },
  sessionCapabilities: { fork: {}, list: {}, resume: {} },
  // ADD THIS:
  fsCapabilities: {
    readTextFile: true,
    writeTextFile: true,
  },
},
```

#### 2. Implement Filesystem Methods

**File**: `packages/opencode/src/acp/agent.ts`  
**Location**: After `cancel()` method (~line 1483)  
**Add**: Two new methods that leverage existing `AgentSideConnection` infrastructure

```typescript
/**
 * Handle fs/read_text_file ACP method
 */
async readTextFile(params: { sessionId: string; path: string }) {
  log.info("fs/read_text_file request", { sessionId: params.sessionId, path: params.path });

  const session = this.sessionManager.get(params.sessionId);

  // Use existing AgentSideConnection method (handles permissions automatically)
  return await this.connection.readTextFile({
    sessionId: params.sessionId,
    path: params.path,
  });
}

/**
 * Handle fs/write_text_file ACP method
 */
async writeTextFile(params: { sessionId: string; path: string; content: string }) {
  log.info("fs/write_text_file request", {
    sessionId: params.sessionId,
    path: params.path,
    contentLength: params.content.length
  });

  const session = this.sessionManager.get(params.sessionId);

  // Use existing AgentSideConnection method (handles permissions automatically)
  await this.connection.writeTextFile({
    sessionId: params.sessionId,
    path: params.path,
    content: params.content,
  });

  return {}; // ACP convention for successful write operations
}
```

### Build and Test Strategy

#### Prerequisites

- Node.js environment with bun installed
- Access to kilocode repository at `/Users/kimptoc/Projects/kilocode/`
- Ability to build and run kilo CLI locally

#### Build Process

```bash
cd /Users/kimptoc/Projects/kilocode
git checkout -b feat/acp-filesystem-capabilities
# Make the changes above
bun run build  # or appropriate build command
```

#### Testing Process

```bash
# Test 1: Initialize (should work as before)
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientInfo":{"name":"test","version":"1.0"},"clientCapabilities":{"fs":{"readTextFile":true,"writeTextFile":true}}}}' | ./bin/kilo acp

# Test 2: Session creation (should work as before)
echo '{"jsonrpc":"2.0","id":2,"method":"session/new","params":{"cwd":"/tmp","mcpServers":[]}}' | ./bin/kilo acp

# Test 3: File read (NEW - should work after enhancement)
echo "test content" > /tmp/test-file.txt
echo '{"jsonrpc":"2.0","id":3,"method":"fs/read_text_file","params":{"path":"/tmp/test-file.txt"}}' | ./bin/kilo acp

# Test 4: File write (NEW - should work after enhancement)
echo '{"jsonrpc":"2.0","id":4,"method":"fs/write_text_file","params":{"path":"/tmp/output.txt","content":"Written by enhanced kilo acp"}}' | ./bin/kilo acp
```

### Integration Testing

```bash
# Test with acpx (if available)
echo "read the README file" | acpx --agent ./bin/kilo
echo "create a hello world script" | acpx --agent ./bin/kilo
```

## Success Criteria

✅ **Capability Advertisement**: `initialize` response includes `fsCapabilities`  
✅ **File Read**: `fs/read_text_file` method works with proper path sandboxing  
✅ **File Write**: `fs/write_text_file` method works with content writing  
✅ **Permission Integration**: Uses existing permission system for security  
✅ **Error Handling**: Proper ACP error codes for filesystem failures  
✅ **ACP Compliance**: All responses follow JSON-RPC 2.0 format

## Risk Mitigation

### Potential Issues

1. **ACP SDK Method Registration**: Need to verify the SDK automatically routes `fs/*` methods
2. **Permission System Integration**: Ensure filesystem ops use existing permission flow
3. **Path Security**: Leverage existing sandboxing for security
4. **Build Process**: Understand kilocode build system (bun-based)

### Fallback Plan

If enhancing native kilo proves complex, we can:

1. Keep our `cloud.kilo` adapter as the filesystem-enabled ACP solution
2. Document both approaches for different use cases
3. Submit enhancement request to kilo team for future versions

## Next Steps

1. **Setup**: Create feature branch in kilocode repository
2. **Implementation**: Add the two methods described above
3. **Testing**: Validate filesystem capabilities work correctly
4. **Integration**: Test with acpx and other ACP clients
5. **Documentation**: Update kilocode docs with new capabilities
6. **PR**: Submit pull request to main kilocode repository

## Repository Context

- **Current repo**: `/Users/kimptoc/Projects/cloud.kilo` (where issue #922 was filed)
- **Target repo**: `/Users/kimptoc/Projects/kilocode` (where native kilo acp lives)
- **Goal**: Enhance native implementation rather than creating separate adapter

This approach follows the "kilo-way" by improving the core kilo CLI rather than creating external adapters.
