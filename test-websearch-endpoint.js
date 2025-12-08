#!/usr/bin/env node

/**
 * Test script for the /v1/chat/completions web search bypass endpoint
 * 
 * Usage:
 *   node test-websearch-endpoint.js [search_query]
 * 
 * Example:
 *   node test-websearch-endpoint.js "latest kubernetes features"
 */

const http = require('http');

const query = process.argv[2] || 'test search query';
const port = process.env.PORT || 3456;

const data = JSON.stringify({
    messages: [{
        role: 'user',
        content: query
    }]
});

const options = {
    hostname: 'localhost',
    port: port,
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
    },
};

console.log(`Testing web search endpoint at http://localhost:${port}/v1/chat/completions`);
console.log(`Search query: "${query}"\n`);

const req = http.request(options, (res) => {
    let body = '';

    res.on('data', (chunk) => {
        body += chunk;
    });

    res.on('end', () => {
        console.log(`Status Code: ${res.statusCode}`);
        console.log(`Status Message: ${res.statusMessage}\n`);

        try {
            const response = JSON.parse(body);

            if (response.error) {
                console.log('❌ Error Response:');
                console.log(JSON.stringify(response.error, null, 2));
            } else if (response.choices && response.choices[0]) {
                console.log('✅ Success! Search results:\n');
                const result = response.choices[0].message.content[0].result;
                console.log(result);
            } else {
                console.log('⚠️  Unexpected response format:');
                console.log(JSON.stringify(response, null, 2));
            }
        } catch (e) {
            console.log('❌ Failed to parse response:');
            console.log(body);
        }
    });
});

req.on('error', (error) => {
    console.error('❌ Request failed:', error.message);
    console.error('\nMake sure the server is running with: pnpm start');
});

req.write(data);
req.end();
