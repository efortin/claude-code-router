# Claude Code Router

> A fork of [musistudio/claude-code-router](https://github.com/musistudio/claude-code-router) - Route Claude Code requests to different LLM providers.

## Overview

This fork maintains the core functionality of claude-code-router with the following modifications:

- **No Authentication Required**: All API key authentication has been removed for simplified deployment
- **CORS Enabled**: Configured for ingress endpoints with dynamic origin support
- **Kubernetes Ready**: Pre-configured for deployment with ingress support

For complete documentation on upstream features, please refer to the [upstream project](https://github.com/musistudio/claude-code-router).

## Quick Start

### Development

```bash
# Install dependencies
mise install

# Build
task build

# Run tests
task test

# Lint
task lint
```

### Docker Deployment

```bash
# Build and push Docker image
task docker

# Deploy to Kubernetes
task deploy
```

### Configuration

The router uses `~/.claude-code-router/config.json` for configuration. See [upstream documentation](https://github.com/musistudio/claude-code-router#2-configuration) for details.

Example minimal config:
```json
{
  "LOG": true,
  "INGRESS_HOST": "https://your-ingress-endpoint.example.com",
  "Providers": [
    {
      "name": "openai",
      "api_base_url": "https://api.openai.com/v1/chat/completions",
      "api_key": "$OPENAI_API_KEY",
      "models": ["gpt-4"]
    }
  ],
  "Router": {
    "default": "openai,gpt-4"
  }
}
```

#### Configuration Options

- `INGRESS_HOST` (optional): The ingress endpoint URL for CORS configuration. Defaults to localhost if not set.
- `PORT` (default: 3456): The port the router listens on
- `HOST` (default: 127.0.0.1): The host address to bind to

**Note**: This fork has removed API key authentication. The router is an open proxy - secure it at the ingress/network level.

## Kubernetes Deployment

The router is configured for Kubernetes deployment with ingress support:

```bash
# Deploy to Kubernetes
kubectl apply -f deployments/k8s/

# Verify deployment
kubectl get pods -n anthropic
kubectl get svc -n anthropic
kubectl get ingress -n anthropic
```

### CORS Configuration

CORS is automatically configured for:
- Local development: `http://127.0.0.1:3456`, `http://localhost:3456`
- Ingress endpoint: Configured via `INGRESS_HOST` in ConfigMap

Update `deployments/k8s/configmap.yml` to set your ingress endpoint:

```yaml
config.json: |
  {
    "INGRESS_HOST": "https://your-ingress-endpoint.example.com",
    ...
  }
```

## Using with Claude Code

Set up a shell function to route Claude Code through the ingress:

```bash
function claudie {
  (
    clear;
    # Override base URL to route through ingress
    # Use main config with Claude Max session, router will ignore auth
    export ANTHROPIC_BASE_URL="https://anthropic.sir-alfred.io"
    export ANTHROPIC_MODEL="qwen3-coder-30b-fp8"

    claude "$@"
  )
}
```

## Available Tasks

Run `task --list` to see all available commands:

- `task build` - Build the project
- `task test` - Run tests with coverage
- `task lint` - Run linting checks
- `task docker` - Build and push Docker image
- `task deploy` - Full k8s deployment

## License

MIT - See [LICENSE](LICENSE) file

## Credits

This project is a fork of [claude-code-router](https://github.com/musistudio/claude-code-router) by [@musistudio](https://github.com/musistudio).
