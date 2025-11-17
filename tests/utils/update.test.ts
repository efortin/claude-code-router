import { exec } from 'child_process';
import { promisify } from 'util';

// Mock the exec function
jest.mock('child_process', () => ({
  exec: jest.fn(),
}));

// Import after mocking
const { checkForUpdates } = require('../../src/utils/update');

const execPromise = promisify(exec);

describe('Update Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkForUpdates', () => {
    it('should detect when a new version is available', async () => {
      // Mock npm view command to return a newer version
      (execPromise as jest.Mock).mockResolvedValue({
        stdout: '2.0.0\n',
        stderr: '',
      });

      const result = await checkForUpdates('1.0.0');

      expect(result.hasUpdate).toBe(true);
      expect(result.latestVersion).toBe('2.0.0');
    });

    it('should detect when no update is available', async () => {
      // Mock npm view command to return same version
      (execPromise as jest.Mock).mockResolvedValue({
        stdout: '1.0.0\n',
        stderr: '',
      });

      const result = await checkForUpdates('1.0.0');

      expect(result.hasUpdate).toBe(false);
      expect(result.latestVersion).toBe('1.0.0');
    });

    it('should handle errors gracefully', async () => {
      // Mock npm view command to throw error
      (execPromise as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await checkForUpdates('1.0.0');

      expect(result.hasUpdate).toBe(false);
      expect(result.latestVersion).toBe('1.0.0');
    });

    it('should correctly compare semantic versions', async () => {
      (execPromise as jest.Mock).mockResolvedValue({
        stdout: '1.0.10\n',
        stderr: '',
      });

      const result = await checkForUpdates('1.0.9');

      expect(result.hasUpdate).toBe(true);
    });
  });
});
