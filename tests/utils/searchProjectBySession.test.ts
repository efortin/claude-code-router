import { searchProjectBySession } from '../../src/utils/router';

// Mock the file system operations
jest.mock('fs/promises', () => ({
  opendir: jest.fn(),
  stat: jest.fn(),
}));

describe('searchProjectBySession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return null when no projects are found', async () => {
    // Mock file system operations to return no matches
    (require('fs/promises') as any).opendir = jest.fn().mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield { name: 'project1', isDirectory: () => true };
        yield { name: 'project2', isDirectory: () => true };
      }
    });

    (require('fs/promises') as any).stat = jest.fn().mockRejectedValue(new Error('Not found'));

    const result = await searchProjectBySession('session123');
    expect(result).toBeNull();
  });

  it('should return project name when session file exists', async () => {
    // Mock file system operations to return a match
    (require('fs/promises') as any).opendir = jest.fn().mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield { name: 'myproject', isDirectory: () => true };
      }
    });

    (require('fs/promises') as any).stat = jest.fn().mockResolvedValue({ isFile: () => true });

    const result = await searchProjectBySession('session123');
    expect(result).toBe('myproject');
  });

  it('should handle errors gracefully', async () => {
    // Mock file system operations to throw an error
    (require('fs/promises') as any).opendir = jest.fn().mockRejectedValue(new Error('Directory error'));

    const result = await searchProjectBySession('session123');
    expect(result).toBeNull();
  });

  it('should handle empty project directory', async () => {
    // Mock file system operations to return no directories
    (require('fs/promises') as any).opendir = jest.fn().mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        // No directories yielded
      }
    });

    (require('fs/promises') as any).stat = jest.fn().mockRejectedValue(new Error('Not found'));

    const result = await searchProjectBySession('session123');
    expect(result).toBeNull();
  });
});