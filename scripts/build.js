#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('Building Claude Code Router...');

try {
  // Build the main CLI application
  console.log('Building CLI application...');
  const externals = [
    'tiktoken',
    'fast-xml-parser',
    'rotating-file-stream',
    'json5',
    'find-process',
    '@musistudio/llms',
    '@fastify/static',
    'lru-cache',
  ].map(pkg => `--external:${pkg}`).join(' ');
  execSync(`npx esbuild src/cli.ts --bundle --platform=node --outfile=dist/cli.js ${externals}`, { stdio: 'inherit' });
  
  // Copy the tiktoken WASM file if it exists
  if (fs.existsSync('node_modules/tiktoken/tiktoken_bg.wasm')) {
    console.log('Copying tiktoken WASM file...');
    execSync('npx shx cp node_modules/tiktoken/tiktoken_bg.wasm dist/tiktoken_bg.wasm', { stdio: 'inherit' });
  } else {
    console.log('Tiktoken WASM file not found, skipping...');
  }

  console.log('Build completed successfully!');
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}