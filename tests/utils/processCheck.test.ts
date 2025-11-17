import { existsSync, readFileSync, writeFileSync } from 'fs';
import {
  savePid,
  getServicePid,
  incrementReferenceCount,
  decrementReferenceCount,
  getReferenceCount,
} from '../../src/utils/processCheck';

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

jest.mock('find-process', () => jest.fn());
jest.mock('child_process', () => ({
  exec: jest.fn(),
  execSync: jest.fn(),
}));

describe('Process Check Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('savePid', () => {
    it('should save PID to file', () => {
      savePid(12345);

      expect(writeFileSync).toHaveBeenCalledWith(expect.stringContaining('pid'), '12345');
    });
  });

  describe('getServicePid', () => {
    it('should return PID when file exists and contains valid PID', () => {
      (existsSync as jest.Mock).mockReturnValue(true);
      (readFileSync as jest.Mock).mockReturnValue('12345');

      const pid = getServicePid();

      expect(pid).toBe(12345);
    });

    it('should return null when file does not exist', () => {
      (existsSync as jest.Mock).mockReturnValue(false);

      const pid = getServicePid();

      expect(pid).toBeNull();
    });

    it('should return null when PID is invalid', () => {
      (existsSync as jest.Mock).mockReturnValue(true);
      (readFileSync as jest.Mock).mockReturnValue('invalid');

      const pid = getServicePid();

      expect(pid).toBeNull();
    });

    it('should handle read errors gracefully', () => {
      (existsSync as jest.Mock).mockReturnValue(true);
      (readFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('Read error');
      });

      const pid = getServicePid();

      expect(pid).toBeNull();
    });
  });

  describe('incrementReferenceCount', () => {
    it('should increment reference count from 0 when file does not exist', () => {
      (existsSync as jest.Mock).mockReturnValue(false);

      incrementReferenceCount();

      expect(writeFileSync).toHaveBeenCalledWith(expect.stringContaining('reference'), '1');
    });

    it('should increment existing reference count', () => {
      (existsSync as jest.Mock).mockReturnValue(true);
      (readFileSync as jest.Mock).mockReturnValue('5');

      incrementReferenceCount();

      expect(writeFileSync).toHaveBeenCalledWith(expect.stringContaining('reference'), '6');
    });
  });

  describe('decrementReferenceCount', () => {
    it('should decrement reference count', () => {
      (existsSync as jest.Mock).mockReturnValue(true);
      (readFileSync as jest.Mock).mockReturnValue('5');

      decrementReferenceCount();

      expect(writeFileSync).toHaveBeenCalledWith(expect.stringContaining('reference'), '4');
    });

    it('should not go below 0', () => {
      (existsSync as jest.Mock).mockReturnValue(true);
      (readFileSync as jest.Mock).mockReturnValue('0');

      decrementReferenceCount();

      expect(writeFileSync).toHaveBeenCalledWith(expect.stringContaining('reference'), '0');
    });
  });

  describe('getReferenceCount', () => {
    it('should return 0 when file does not exist', () => {
      (existsSync as jest.Mock).mockReturnValue(false);

      const count = getReferenceCount();

      expect(count).toBe(0);
    });

    it('should return stored reference count', () => {
      (existsSync as jest.Mock).mockReturnValue(true);
      (readFileSync as jest.Mock).mockReturnValue('10');

      const count = getReferenceCount();

      expect(count).toBe(10);
    });

    it('should return 0 for invalid count', () => {
      (existsSync as jest.Mock).mockReturnValue(true);
      (readFileSync as jest.Mock).mockReturnValue('invalid');

      const count = getReferenceCount();

      expect(count).toBe(0);
    });
  });
});
