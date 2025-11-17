# XML Tool Call Handling

## Problem

vLLM sometimes outputs XML-style tool calls instead of the proper Anthropic API JSON format. This causes errors like:

```
Unknown part type: tool_use None
```

## Solution Overview

The XML parsing system automatically detects and transforms malformed XML tool calls into proper Anthropic API format. See [XML_PARSING_ARCHITECTURE.md](./XML_PARSING_ARCHITECTURE.md) for detailed architecture and data flow diagrams.

### Example of XML Output from vLLM

```xml
<function=Task>
<parameter=subagent_type>
Explore

<parameter=prompt>
Explore the codebase to understand its structure...
```

### Expected Anthropic API Format

```json
{
  "type": "tool_use",
  "id": "toolu_12345",
  "name": "Task",
  "input": {
    "subagent_type": "Explore",
    "prompt": "Explore the codebase..."
  }
}
```

## Solution

### Components

1. **XMLToolCallParser** (`src/utils/XMLToolCallParser.ts`)
   - Detects multiple XML formats (`<tool_call>`, `<function_call>`, `<function=...>`)
   - Extracts tool names and parameters/arguments
   - Converts to proper Anthropic API tool_use format
   - Handles streaming/buffering for incomplete XML
   - Supports CDATA sections and XML entity decoding

2. **XMLToolCallTransformStream** (`src/utils/XMLToolCallTransform.stream.ts`)
   - Transform stream that sits in the SSE pipeline
   - Detects XML tool calls in text deltas
   - Transforms them into proper content_block_start/delta/stop events
   - Maintains proper event sequencing for streaming
   - Preserves content indices and token counting

### Integration

The transform stream is integrated into the streaming pipeline in `src/index.ts`:

```typescript
const eventStream = payload
  .pipeThrough(new SSEParserTransform())          // Parse SSE events
  .pipeThrough(new XMLToolCallTransformStream())  // Transform XML tool calls
```

This applies to both:
- Main request responses (line ~200)
- Recursive agent call responses (line ~298)

### How It Works

1. **Detection**: When a text delta contains `<function=` or `<parameter=`, the parser activates
2. **Extraction**: Tool name and parameters are extracted from XML tags
3. **Transformation**: 
   - Text block is stopped
   - New tool_use block is started with extracted name and generated ID
   - Parameters are sent as `input_json_delta`
   - Tool block is stopped
4. **Cleaning**: XML tags are removed from the text stream

### Example Transformation

**Input SSE Event:**
```json
{
  "event": "content_block_delta",
  "data": {
    "type": "content_block_delta",
    "index": 0,
    "delta": {
      "type": "text_delta",
      "text": "Let me help. <function=search>\n<parameter=query>test\n</function>"
    }
  }
}
```

**Output SSE Events:**
```json
// 1. Clean text
{
  "event": "content_block_delta",
  "data": {
    "delta": { "type": "text_delta", "text": "Let me help. " }
  }
}

// 2. Stop text block
{ "event": "content_block_stop", "data": { "index": 0 } }

// 3. Start tool block
{
  "event": "content_block_start",
  "data": {
    "index": 1,
    "content_block": {
      "type": "tool_use",
      "id": "toolu_1234567890_0",
      "name": "search",
      "input": {}
    }
  }
}

// 4. Send tool input
{
  "event": "content_block_delta",
  "data": {
    "index": 1,
    "delta": {
      "type": "input_json_delta",
      "partial_json": "{\"query\":\"test\"}"
    }
  }
}

// 5. Stop tool block
{ "event": "content_block_stop", "data": { "index": 1 } }
```

## Testing

Tests are located in:
- `src/utils/__tests__/XMLToolCallParser.spec.ts` - Parser logic tests
- `src/utils/__tests__/XMLToolCallTransform.integration.test.ts` - Integration tests

Run tests with:
```bash
npm test
```

## Debugging

To check for XML tool call issues in production:

1. Check debug logs: `~/.claude/debug/`
2. Search for "Unknown part type: tool_use None" errors
3. Look for XML patterns like `<function=` in request/response logs

## Configuration

No configuration needed - the transformation is automatic and transparent.

The parser will:
- ✓ Pass through normal text unchanged
- ✓ Pass through proper tool_use blocks unchanged  
- ✓ Only transform when XML patterns are detected
- ✓ Handle partial XML in streaming chunks (buffering)

## Limitations

1. **Incomplete XML**: If a stream ends mid-XML-tag, the incomplete tool call is dropped
2. **Nested XML**: Nested function tags are not supported
3. **Parameter Order**: Parameters must appear after the function tag
4. **Closing Tags**: `</function>` is required to complete a tool call

## Future Improvements

- [ ] Add metrics for XML detection frequency
- [ ] Add logging for transformation events
- [ ] Support alternative XML formats if needed
- [ ] Add recovery for malformed XML
