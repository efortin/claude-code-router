# feat: Direct vision API calls with JWT authentication

## Summary

Enables JWT-authenticated image analysis by modifying the image agent to call the vision API directly, bypassing the provider system to avoid `api_key` override issues.

## Problem

The image model (`OpenAIVision`) requires JWT authentication, but the `@musistudio/llms` library was using the provider's `api_key` field to set `Authorization: Bearer <api_key>`, which overrode the JWT forwarding mechanism in the `forwardAuthHeader` function.

**Error encountered:**
```
401: Jwt is not in the form of Header.Payload.Signature with two dots and 3 sections
```

## Solution

Modified the image agent to bypass the provider routing system entirely and call the vision API directly with proper JWT authentication forwarding.

## Changes

### 1. Unified Vision API Handling & Image Format Transformation

**Files:**
- [src/index.ts](src/index.ts)
- [src/agents/image.agent.ts](src/agents/image.agent.ts)
- [src/utils/vision.ts](src/utils/vision.ts) (NEW)

**Key Changes:**
1.  **Format Transformation:** Created `transformToOpenAIVisionFormat` utility to convert Claude's `{ type: 'image', source: { ... } }` format to OpenAI's `{ type: 'image_url', image_url: { ... } }` format. This resolved `Unknown part type: image None` errors.
2.  **Direct API Routing (index.ts):** Added interception hook in `index.ts` to route requests for the configured image model directly to the Vision API, using JWT authentication and applying the format transformation.
3.  **Tool Update (ImageAgent):** Updated the `analyzeImage` tool in `ImageAgent` to use the same format transformation and direct API call pattern, ensuring agent-initiated analysis also works correctly.

**Code Snippet (Format Transformation):**
```typescript
// src/utils/vision.ts
export const transformToOpenAIVisionFormat = (body: any) => {
  // ... maps messages ...
  if (item.type === 'image' && item.source) {
    return {
      type: 'image_url',
      image_url: {
        url: `data:${item.source.media_type};base64,${item.source.data}`,
      },
    };
  }
  // ...
};
```

### 2. Tests

**File:** [tests/agents/image.agent.test.ts](tests/agents/image.agent.test.ts)

Created comprehensive test suite covering:
- ✅ Lowercase `authorization` header forwarding
- ✅ Capitalized `Authorization` header forwarding
- ✅ No header when not provided
- ✅ Lowercase preference when both present
- ✅ Provider not found handling
- ✅ System prompt injection

All 6 tests passing.

## Benefits

1. **Fixes JWT authentication** - No longer blocked by `api_key` override
2. **Simpler architecture** - Direct API calls, no routing complexity for vision
3. **Better separation** - Vision API auth handled independently from provider system
4. **Maintains compatibility** - Other providers continue using existing routing

## Related Infrastructure

> **Note:** These infrastructure changes were also made in the `ai-prodeng` repository:

1. **Gateway JWT forwarding** - `apps/base/vllm/jwt/gateway-extension.yaml`
   ```yaml
   keepToken: "Forward"  # Gateway forwards JWT to backend after validation
   ```

2. **ConfigMap** - `apps/base/anthropic-router/resources/configmap.yaml`
   ```jsonc
   {
     "name": "OpenAIVision",
     "api_key": "jwt-from-header",  // Placeholder for provider registration
     // ...
   }
   ```

3. **TLS workaround** - `apps/base/anthropic-router/resources/deployment.yaml`
   ```yaml
   env:
     - name: NODE_TLS_REJECT_UNAUTHORIZED
       value: "0"  # Temporary fix for cert SAN mismatch
   ```

## Testing

```bash
npm test -- tests/agents/image.agent.test.ts
# All tests passing ✅
```

## Deployment

1. Build and push new Docker image with this fix
2. Update Kubernetes deployment to use new image
3. Deploy infrastructure changes from `ai-prodeng` repo
4. Test image analysis with JWT authentication

---

**Branch:** `feat/passthrough-authorization-for-image`
**Type:** Feature / Bug Fix
**Breaking:** No
