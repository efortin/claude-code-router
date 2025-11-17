import { CONFIG_FILE, HOME_DIR, PID_FILE, REFERENCE_COUNT_FILE } from '../src/constants';
import { homedir, tmpdir } from 'os';
import { join } from 'path';

describe('Constants', () => {
  it('should define HOME_DIR correctly', () => {
    expect(HOME_DIR).toBe(join(homedir(), '.claude-code-router'));
  });

  it('should define CONFIG_FILE in HOME_DIR', () => {
    expect(CONFIG_FILE).toBe(join(HOME_DIR, 'config.json'));
  });

  it('should define PID_FILE in HOME_DIR', () => {
    expect(PID_FILE).toBe(join(HOME_DIR, '.claude-code-router.pid'));
  });

  it('should define REFERENCE_COUNT_FILE in tmpdir', () => {
    expect(REFERENCE_COUNT_FILE).toBe(join(tmpdir(), 'claude-code-reference-count.txt'));
  });
});
