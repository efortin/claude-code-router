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

### 1. Image Agent - Direct API Calls

**File:** [src/agents/image.agent.ts](src/agents/image.agent.ts)

- Changed from internal routing (`http://127.0.0.1:3456/v1/messages`) to direct vision API calls
- Extracts vision API URL from config: `Providers.find(p => p.name === 'OpenAIVision')`
- Parses model name from `Router.image` config (format: `"provider,model"`)
- Forwards JWT directly to vision API without provider system interference

**Before:**
```typescript
const agentResponse = await fetch(
  `http://127.0.0.1:${context.config.PORT || 3456}/v1/messages`,
  { headers, body: JSON.stringify({ model: context.config.Router.image, ... }) }
);
```

**After:**
```typescript
const visionProvider = context.config.Providers?.find((p: any) => p.name === 'OpenAIVision');
const visionApiUrl = visionProvider?.api_base_url || 'https://vision.api.enablers.algolia.net/v1/chat/completions';
const imageModel = context.config.Router.image?.split(',')[1] || 'qwen3-vl-30b-fp8';

const agentResponse = await fetch(
  visionApiUrl,
  { headers, body: JSON.stringify({ model: imageModel, ... }) }
);
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
