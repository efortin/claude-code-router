# Taskfile Guide

This project uses [Task](https://taskfile.dev) and [mise](https://mise.jdx.dev) for development automation.

## Quick Setup

Install required tools with mise:

```bash
# Install mise
curl https://mise.run | sh

# Allow direnv (optional but recommended)
echo 'eval "$(mise activate bash)"' >> ~/.bashrc  # or ~/.zshrc for zsh

# Install tools (node, pnpm)
mise install

# Or manually activate for current session
eval "$(mise activate bash)"
```

## Available Tasks

List all available tasks:
```bash
task --list
```

### Main Tasks (7 Essential Commands)

| Task | Description |
|------|-------------|
| `task build` | Build the project |
| `task lint` | Run ESLint and Prettier checks |
| `task fix` | Auto-fix linting issues |
| `task test` | Run tests with coverage |
| `task dev` | Run in development mode |
| `task push` | Validate and push to git |
| `task release` | Build and publish to npm |

## Typical Workflows

### Before Committing
```bash
task validate
```

### Before Pushing
```bash
task push
```

### Development Workflow
```bash
# Install dependencies
task install

# Run in watch mode during development
task test:watch

# Before committing, validate your changes
task validate

# Push to remote after validation
task push
```

### Release Workflow
```bash
# Update version in package.json
npm version patch  # or minor, major

# Build and publish
task release
```

## Task Configuration

The task configuration is in `Taskfile.yml`. You can:

- View task source code: `cat Taskfile.yml`
- Add custom tasks by editing `Taskfile.yml`
- Override variables by setting environment variables

## Integration with IDEs

### VS Code
Install the [Task extension](https://marketplace.visualstudio.com/items?itemName=task.vscode-task) to run tasks from the command palette.

### Other IDEs
Most IDEs support running shell commands, so you can configure shortcuts to run `task <taskname>`.
