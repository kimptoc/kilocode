# ACP Filesystem Enhancement Test Plan

## Implementation Summary ✅

Successfully implemented filesystem capabilities for the native `kilo acp` command:

### 1. Capability Declaration ✅

- Added `fsCapabilities` to `agentCapabilities` in `initialize()` method
- Location: `packages/opencode/src/acp/agent.ts:556-559`
- Declares support for `readTextFile` and `writeTextFile`

### 2. Method Implementation ✅

- Implemented `readTextFile()` method at line 1488
- Implemented `writeTextFile()` method at line 1503
- Both methods leverage existing `AgentSideConnection` infrastructure
- Automatic permission handling through existing system

## Expected Test Results

When the implementation is built and tested:

### Initialize Method

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientInfo":{"name":"test","version":"1.0"},"clientCapabilities":{"fs":{"readTextFile":true,"writeTextFile":true}}}}' | kilo acp
```

Should return JSON including:

```json
{
  "agentCapabilities": {
    "fsCapabilities": {
      "readTextFile": true,
      "writeTextFile": true
    }
  }
}
```

### File Read Test

```bash
echo "test content" > /tmp/test-file.txt
echo '{"jsonrpc":"2.0","id":1,"method":"fs/read_text_file","params":{"sessionId":"test-session","path":"/tmp/test-file.txt"}}' | kilo acp
```

Should return the file content instead of "Method not found".

### File Write Test

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"fs/write_text_file","params":{"sessionId":"test-session","path":"/tmp/output.txt","content":"Written by enhanced kilo acp"}}' | kilo acp
```

Should create the file successfully and return success response.

## Changes Made

1. **packages/opencode/src/acp/agent.ts:556-559** - Added fsCapabilities declaration
2. **packages/opencode/src/acp/agent.ts:1485-1520** - Added readTextFile and writeTextFile methods
3. **Committed to feature branch**: `feat/acp-filesystem-capabilities`
4. **Created upstream issue**: #6765 in Kilo-Org/kilocode

## Next Steps

1. Build and test the implementation when build environment is ready
2. Test with real ACP clients like `acpx`
3. Submit PR to upstream repository
4. Update cloud repo issue #922 to reference this implementation
