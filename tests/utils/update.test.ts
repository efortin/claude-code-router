import { exec } from 'child_process';

// Mock the exec function
jest.mock('child_process');

// Import after mocking
const { checkForUpdates } = require('../../src/utils/update');

const mockedExec = exec as jest.MockedFunction<typeof exec>;

describe('Update Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkForUpdates', () => {
    it('should detect when a new version is available', async () => {
      // Mock npm view command to return a newer version
      mockedExec.mockImplementation((cmd, callback: any) => {
        callback(null, { stdout: '2.0.0\n', stderr: '' });
        return {} as any;
      });

      const result = await checkForUpdates('1.0.0');

      expect(result.hasUpdate).toBe(true);
      expect(result.latestVersion).toBe('2.0.0');
    });

    it('should detect when no update is available', async () => {
      // Mock npm view command to return same version
      mockedExec.mockImplementation((cmd, callback: any) => {
        callback(null, { stdout: '1.0.0\n', stderr: '' });
        return {} as any;
      });

      const result = await checkForUpdates('1.0.0');

      expect(result.hasUpdate).toBe(false);
      expect(result.latestVersion).toBe('1.0.0');
    });

    it('should handle errors gracefully', async () => {
      // Mock npm view command to throw error
      mockedExec.mockImplementation((cmd, callback: any) => {
        callback(new Error('Network error'), { stdout: '', stderr: '' });
        return {} as any;
      });

      const result = await checkForUpdates('1.0.0');

      expect(result.hasUpdate).toBe(false);
      expect(result.latestVersion).toBe('1.0.0');
    });

    it('should correctly compare semantic versions', async () => {
      mockedExec.mockImplementation((cmd, callback: any) => {
        callback(null, { stdout: '1.0.10\n', stderr: '' });
        return {} as any;
      });

      const result = await checkForUpdates('1.0.9');

      expect(result.hasUpdate).toBe(true);
    });
  });
});
