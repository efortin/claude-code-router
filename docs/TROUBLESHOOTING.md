# Troubleshooting Guide

## Common Issues

### 1. "Unknown part type: tool_use None" Error

**Cause**: vLLM is outputting XML-style tool calls instead of JSON format.

**Example XML Output**:
```xml
<function=TaskName>
<parameter=param1>value1
<parameter=param2>value2
</function>
```

**Solution**: ✅ Automatically handled by XMLToolTransformStream

The router now automatically detects and transforms XML tool calls to proper Anthropic API format. No configuration needed.

**How to Verify**:
1. Check `~/.claude/debug/` for debug logs
2. Look for XML patterns in error logs
3. Rebuild and restart: `npm run build && npm start`

### 2. Tool Calls Not Being Detected

**Symptoms**:
- Tool calls appear as plain text
- No tool execution happening

**Check**:
1. Verify XML format matches expected pattern
2. Check that `</function>` closing tags are present
3. Look for parsing errors in logs

**Debug**:
```bash
# Check recent debug logs
tail -100 ~/.claude/debug/latest
```

### 3. Streaming Issues

**Symptoms**:
- Incomplete tool calls
- Tool calls cut off mid-stream

**Cause**: XML tool call split across multiple chunks

**Solution**: The XMLToolParser buffers incomplete XML automatically. If the stream ends before `</function>`, the incomplete tool call is dropped (by design).

### 4. Build Errors

**Issue**: TypeScript compilation errors after adding XML parser

**Fix**:
```bash
# Clean and rebuild
rm -rf dist
npm run build
```

### 5. Test Failures

**Issue**: Jest localStorage errors

**Current Status**: Known issue with test environment setup

**Workaround**: 
- Code builds successfully with `npm run build`
- Manual testing script available: `test-xml-parser.js`
- Tests are present but may need environment configuration

## Debugging Tools

### Check Debug Logs

```bash
# Latest logs
cat ~/.claude/debug/latest

# Search for errors
grep -r "tool_use None" ~/.claude/debug/

# Search for XML patterns
grep -r "<function=" ~/.claude/debug/
```

### Monitor Live Requests

```bash
# Watch the logs directory
tail -f ~/.claude/debug/latest
```

### Test XML Parser Manually

Create a test file:

```javascript
const {transformXMLToolCalls} = require('./cli.js');

const xml = `<function=Test>
<parameter=param>value
</function>`;

console.log(transformXMLToolCalls(xml));
```

## Performance Notes

- XML detection adds minimal overhead (regex check)
- Only activates when XML patterns detected
- Normal JSON tool calls pass through unchanged
- Buffering handles streaming chunks efficiently

## Getting Help

1. **Check logs**: `~/.claude/debug/`
2. **Review documentation**: `docs/XML_TOOL_CALL_HANDLING.md`
3. **Verify build**: `npm run build`
4. **Check integration**: Ensure XMLToolTransformStream is in pipeline

## Quick Fixes

### Reset and Rebuild
```bash
npm run build
# Restart your service
```

### Clear Debug Logs
```bash
rm ~/.claude/debug/*.txt
```

### Check vLLM Configuration
Ensure your vLLM deployment is using compatible chat templates and tool calling configurations.

## Known Limitations

1. **Incomplete XML**: Streams that end mid-XML tag will drop the incomplete tool call
2. **Nested Functions**: Nested `<function>` tags not supported
3. **Test Environment**: Jest localStorage issue pending resolution
