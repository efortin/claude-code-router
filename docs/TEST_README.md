# Tests for claude-code-router

This directory contains the Jest test suite for the claude-code-router project.

## Test Structure

```
__tests__/
├── agents/
│   └── index.test.ts        # Tests for AgentsManager
├── utils/
│   ├── update.test.ts       # Tests for update utilities
│   ├── processCheck.test.ts # Tests for process management
│   ├── rewriteStream.test.ts # Tests for stream rewriting
│   └── SSEParser.test.ts    # Tests for SSE parsing
└── constants.test.ts        # Tests for constants
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (useful during development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

## Coverage Reports

After running `npm run test:coverage`, you can find detailed coverage reports in:
- `coverage/lcov-report/index.html` - HTML report (open in browser)
- `coverage/lcov.info` - LCOV format (for CI/CD integration)

## Writing New Tests

1. Create test files with `.test.ts` or `.spec.ts` extension
2. Place them in the appropriate subdirectory under `__tests__/`
3. Follow the existing test patterns for consistency

Example:
```typescript
describe('MyModule', () => {
  it('should do something', () => {
    expect(true).toBe(true);
  });
});
```

## Mocking

Tests use Jest's mocking capabilities extensively:
- File system operations are mocked in `processCheck.test.ts`
- Child process execution is mocked in `update.test.ts`
- Stream operations are tested using real ReadableStream APIs

## CI/CD Integration

To integrate these tests in your CI/CD pipeline, add:
```yaml
- run: npm test
- run: npm run test:coverage
```
