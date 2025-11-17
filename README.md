# Claude Code Router

> A fork of [musistudio/claude-code-router](https://github.com/musistudio/claude-code-router) - Route Claude Code requests to different LLM providers.

## Overview

This fork maintains the core functionality of claude-code-router with additional deployment configurations for personal use.

For complete documentation, features, and usage instructions, please refer to the [upstream project](https://github.com/musistudio/claude-code-router).

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
