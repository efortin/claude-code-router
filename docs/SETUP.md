# Quick Setup Guide

## Install mise (if not already installed)

```bash
# macOS/Linux
curl https://mise.run | sh

# Or with Homebrew (macOS)
brew install mise

# Add to your shell config
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc  # for zsh
echo 'eval "$(mise activate bash)"' >> ~/.bashrc  # for bash

# Reload shell
source ~/.zshrc  # or ~/.bashrc
```

## Install Project Tools

```bash
# Trust the mise config file
mise trust

# Install node and pnpm via mise
mise install

# Verify installation (use mise exec to run commands)
mise exec -- node --version
mise exec -- pnpm --version
```

**Note:** Task commands automatically use `mise exec`, so you don't need to prefix commands with it manually when using Task.

## Install Task (if not already installed)

```bash
# macOS
brew install go-task

# Or install script
sh -c "$(curl --location https://taskfile.dev/install.sh)" -- -d -b ~/.local/bin
```

## Run Your First Task

```bash
# List all available tasks
task

# Build the project
task build

# Run linting
task lint

# Run tests
task test
```

## Troubleshooting

### "pnpm: executable file not found"

Make sure mise is activated:
```bash
eval "$(mise activate zsh)"  # or bash
mise install
```

### Tools not found after mise install

Reload your shell or manually activate mise:
```bash
source ~/.zshrc  # or ~/.bashrc
# or
eval "$(mise activate zsh)"
```

## Next Steps

See [TASKFILE.md](TASKFILE.md) for detailed task documentation.
See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.
