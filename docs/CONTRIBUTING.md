# Contributing to claude-code-router

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to this project.

## Getting Started

### Prerequisites

- Node.js 18.x or 20.x
- pnpm 8.x
- [Task](https://taskfile.dev) - Task runner

### Setup

1. Fork and clone the repository
```bash
git clone https://github.com/YOUR_USERNAME/claude-code-router.git
cd claude-code-router
```

2. Install dependencies
```bash
task install
# or
pnpm install
```

3. Verify setup
```bash
task validate
```

## Development Workflow

### Running in Development Mode

```bash
task dev
```

### Running Tests

```bash
# Run all tests
task test

# Run tests in watch mode
task test:watch

# Run tests with coverage
task test:coverage
```

### Code Quality

Before committing, ensure your code passes all checks:

```bash
# Run all validation checks
task validate

# This will run:
# - ESLint (linting)
# - Prettier (formatting)
# - TypeScript compiler (type checking)
# - Jest (tests)
```

### Auto-fix Issues

```bash
# Auto-fix linting and formatting issues
task lint:fix

# Format all code
task format
```

## Making Changes

### Branching Strategy

- `main` - Stable releases
- `develop` - Development branch
- Feature branches: `feature/your-feature-name`
- Bug fixes: `fix/bug-description`

### Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new feature
fix: fix bug in module
docs: update documentation
test: add missing tests
refactor: refactor code
chore: update dependencies
```

Examples:
```bash
git commit -m "feat: add support for new provider"
git commit -m "fix: resolve streaming issue in SSE parser"
git commit -m "docs: update Taskfile documentation"
```

### Pull Request Process

1. Create a feature branch from `develop`
```bash
git checkout -b feature/your-feature-name
```

2. Make your changes and commit
```bash
git add .
git commit -m "feat: description of your changes"
```

3. Run validation before pushing
```bash
task validate
```

4. Push to your fork
```bash
task push
# or manually:
git push origin feature/your-feature-name
```

5. Create a Pull Request on GitHub
   - Fill out the PR template
   - Link any related issues
   - Ensure CI passes

## Code Style

### TypeScript

- Use TypeScript for all source code
- Follow the existing code style
- Add JSDoc comments for public APIs
- Use meaningful variable and function names

### Testing

- Write tests for new features
- Update tests when modifying existing features
- Aim for high test coverage (>80%)
- Place tests in `src/__tests__/` directory

### File Structure

```
src/
├── __tests__/          # Test files
│   ├── agents/
│   ├── utils/
│   └── ...
├── agents/             # Agent implementations
├── middleware/         # Middleware functions
├── utils/              # Utility functions
├── constants.ts        # Constants
├── index.ts            # Main entry point
└── cli.ts              # CLI entry point
```

## Available Tasks

See [TASKFILE.md](TASKFILE.md) for detailed task documentation.

Quick reference:
- `task` - List all tasks
- `task install` - Install dependencies
- `task build` - Build project
- `task lint` - Run linting
- `task test` - Run tests
- `task validate` - Run all checks
- `task push` - Validate and push

## CI/CD

All pull requests automatically run:
- Linting (ESLint + Prettier)
- Type checking (TypeScript)
- Tests with coverage
- Build verification

The CI must pass before a PR can be merged.

## Release Process

Releases are automated via GitHub Actions:

1. Update version in `package.json`
```bash
npm version patch  # or minor, major
```

2. Push the tag
```bash
git push --tags
```

3. GitHub Actions will:
   - Run all tests
   - Build the project
   - Create a GitHub release
   - Publish to npm

## Getting Help

- 📚 [Documentation](README.md)
- 💬 [Discord](https://discord.gg/rdftVMaUcS)
- 🐛 [Issue Tracker](https://github.com/musistudio/claude-code-router/issues)

## Code of Conduct

Please be respectful and constructive in all interactions. We're here to build something great together.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
