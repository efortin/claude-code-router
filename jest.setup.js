// Mock localStorage for tests - must run before anything else
if (typeof global.localStorage === 'undefined') {
  Object.defineProperty(global, 'localStorage', {
    value: {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn(),
      length: 0,
      key: jest.fn(),
    },
    writable: true,
    configurable: true,
  });
}
