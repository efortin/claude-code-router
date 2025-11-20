# MicroK8s Deployment Guide

This guide explains how to build and deploy the Claude Code Router to MicroK8s.

## Prerequisites

- MicroK8s installed and running
- Task runner installed (`brew install go-task/tap/go-task` on macOS)

## Setup MicroK8s Registry

First, enable the built-in registry addon:

```bash
task microk8s:enable-registry
```

This creates a local registry at `localhost:32000` that MicroK8s can access.

## Building Images

There are three methods to build images for MicroK8s:

### Method 1: Build and Push to MicroK8s Registry (Recommended)

```bash
task microk8s:build-registry
```

This builds the Docker image and pushes it directly to the MicroK8s internal registry. Requires the registry addon to be enabled.

### Method 2: Build with Docker and Import

```bash
task microk8s:build
```

This builds with Docker and imports the image into MicroK8s containerd directly.

### Method 3: Build with Podman (If Available)

```bash
task microk8s:build-podman
```

This uses Podman to build the image and imports it into MicroK8s. Requires Podman to be installed.

## Deployment

### Full Deployment (Build + Deploy)

```bash
task microk8s:deploy
```

This will:
1. Build the image and push to the registry
2. Restart the deployment
3. Wait for rollout to complete
4. Show status

### Quick Redeploy (No Build)

If you've already built the image and just want to restart:

```bash
task microk8s:redeploy
```

## Useful Commands

### List images in MicroK8s
```bash
task microk8s:images
```

### Check MicroK8s status
```bash
task microk8s:status
```

### View logs
```bash
kubectl --context microk8s logs -f deployment/claude-code-router -n anthropic
```

### Check pods
```bash
kubectl --context microk8s get pods -n anthropic
```

## Configuration

You can customize the following variables in `Taskfile.microk8s.yml`:

- `IMAGE_NAME`: Docker image name (default: `claude-code-router`)
- `IMAGE_TAG`: Image tag (default: `latest`)
- `REGISTRY`: Registry URL (default: `localhost:32000`)
- `NAMESPACE`: Kubernetes namespace (default: `anthropic`)

## Troubleshooting

### Registry not accessible
If you get registry connection errors:
```bash
microk8s enable registry
```

### Image not found in MicroK8s
Check if the image was properly imported:
```bash
microk8s ctr images ls | grep claude-code-router
```

### Pod not starting
Check pod events and logs:
```bash
kubectl --context microk8s describe pod -n anthropic -l app=claude-code-router
kubectl --context microk8s logs -n anthropic -l app=claude-code-router
```

### Wrong architecture
Make sure you're building for the right platform. The tasks use `--platform linux/amd64` by default. Adjust if needed for ARM64:
```bash
--platform linux/arm64
```
