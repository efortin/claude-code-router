#!/usr/bin/env node
import { run } from './index';
import { version } from '../package.json';
import { execSync } from 'child_process';

// Get git SHA at build time or runtime
let gitSha = 'unknown';
try {
  gitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
} catch {
  gitSha = process.env.GIT_SHA || 'unknown';
}

const command = process.argv[2];

const HELP_TEXT = `
Claude Code Router - Container/Proxy Mode

Usage: ccr [command]

Commands:
  start         Start the proxy server (default)
  -v, version   Show version information
  -h, help      Show help information

This is a simplified CLI for container/proxy mode.
The service will start and run as the main process.

Example:
  ccr start
  ccr         (defaults to start)
`;

async function main() {
  switch (command) {
    case 'start':
      // In container mode, run the service in foreground
      console.log(`Starting Claude Code Router v${version} (${gitSha})...`);
      run();
      break;
    case '-v':
    case 'version':
      console.log(`claude-code-router v${version} (${gitSha})`);
      break;
    case '-h':
    case 'help':
      console.log(HELP_TEXT);
      break;
    default:
      // Default to start command if no command or unknown command is provided
      console.log(`Starting Claude Code Router v${version} (${gitSha})...`);
      run();
      break;
  }
}

main().catch(console.error);
