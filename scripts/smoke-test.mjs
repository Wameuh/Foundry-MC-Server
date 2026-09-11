/* global console, fetch, process */

const response = await fetch(process.env.MCP_HEALTH_URL ?? 'http://127.0.0.1:3210/health');
if (!response.ok) throw new Error(`Health check failed: ${response.status}`);
console.log(await response.text());
