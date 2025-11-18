# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a fork of [musistudio/claude-code-router](https://github.com/musistudio/claude-code-router) designed to route Claude Code requests to different LLM providers. The key differences from the upstream project are:

- No Authentication Required: All API key authentication has been removed for simplified deployment
- CORS Enabled: Configured for ingress endpoints with dynamic origin support
- Kubernetes Ready: Pre-configured for deployment with ingress support

## Project Structure

The project follows a modular architecture with the following key components:

- `src/`: Main source code directory
  - `index.ts`: Entry point that initializes and runs the server
  - `server.ts`: Creates and configures the Fastify server with routes and middleware
  - `utils/`: Utility functions for configuration, routing, caching, logging, and process management
  - `middleware/`: Request middleware for authentication and CORS
  - `agents/`: Plugin agents for extending functionality (currently only image agent)
  - `constants.ts`: Application constants like paths and default configurations
  - `cli.ts`: Command-line interface for starting the service

- `tests/`: Unit tests for various utilities and components
- `deployments/k8s/`: Kubernetes deployment manifests
- `docs/`: Documentation files

## Core Architecture

The application acts as a reverse proxy that routes Claude Code requests to different LLM providers. Key architectural elements:

1. **Configuration System**: Reads configuration from `~/.claude-code-router/config.json` with environment variable interpolation
2. **Routing Logic**: Routes requests based on model, token count, system prompts, and other criteria
3. **Agent System**: Extensible plugin architecture for adding functionality (currently supports image analysis)
4. **Authentication & CORS**: Simplified CORS configuration for ingress endpoints
5. **Logging & Monitoring**: Rotating log files and usage statistics tracking
6. **Process Management**: PID file management and reference counting for service lifecycle

## Development Workflow

### Building
```bash
# Install dependencies
mise install

# Build the project
task build

# Run tests with coverage
task test

# Lint the codebase
task lint
```

### Running
The service can be started using:
```bash
# Start in development mode
task dev

# Or directly via CLI
ccr start
```

### Testing
Individual tests can be run with:
```bash
# Run all tests
npm test

# Run specific test file
npx jest tests/utils/processCheck.test.ts
```

### Available Tasks
Run `task --list` to see all available commands:
- `task build` - Build the project
- `task test` - Run tests with coverage
- `task lint` - Run linting checks
- `task docker` - Build and push Docker image
- `task deploy` - Full k8s deployment

## Key Features

1. **Multi-Provider Routing**: Route requests to different LLM providers based on configuration
2. **Token-based Routing**: Automatically switch to long-context models based on token count
3. **Agent Extensions**: Support for plugins that extend functionality (image analysis)
4. **Project-based Configuration**: Per-project configuration using session IDs
5. **Kubernetes Deployment Ready**: Pre-configured for Kubernetes with ingress support
6. **Auto-update Capability**: Built-in update checking and installation

## Configuration

The router uses `~/.claude-code-router/config.json` for configuration. Key fields include:
- `Providers`: Array of LLM providers with their API details
- `Router`: Routing rules including default, long context, and model selection criteria
- `INGRESS_HOST`: The ingress endpoint URL for CORS configuration
- `PORT`: Port the router listens on (default: 3456)

## Security Considerations

This fork has removed API key authentication. The router is an open proxy - secure it at the ingress/network level. This makes it suitable for internal network deployments but not for public exposure without proper security controls.

## Kubernetes Deployment

The application is configured for Kubernetes deployment with:
```bash
kubectl apply -f deployments/k8s/
```

The deployment includes:
- Namespace configuration
- ConfigMap with application configuration
- Deployment with service and ingress

## Environment Variables

The application supports environment variable interpolation in configuration files:
- `$VAR_NAME` or `${VAR_NAME}` syntax is supported for environment variables