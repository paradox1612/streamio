const http = require('http');
const logger = require('./logger');

/**
 * Call gluetun's HTTP control API directly (bypasses any proxy).
 * gluetun control server: http://gluetun:8000  (Docker) or http://localhost:8000 (K8s sidecar)
 */
function gluetunRequest(baseUrl, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url = new URL('/v1/vpn/status', baseUrl);
    const options = {
      hostname: url.hostname,
      port: url.port || 8000,
      path: url.pathname,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Bootstrap global-agent to route all outbound HTTP/HTTPS through the gluetun
 * HTTP proxy. Only activates when VPN_ENABLED=true.
 *
 * Must be called before any other require() that performs HTTP requests.
 */
function bootstrapVpnProxy() {
  if (process.env.VPN_ENABLED !== 'true') return;

  const proxyUrl = process.env.GLOBAL_AGENT_HTTP_PROXY || 'http://gluetun:8888';
  // Ensure gluetun control host is excluded so rotation job can reach it directly
  const noProxy = [
    process.env.GLOBAL_AGENT_NO_PROXY || '',
    'gluetun',
    'localhost',
    '127.0.0.1',
    'postgres',
  ].filter(Boolean).join(',');

  process.env.GLOBAL_AGENT_HTTP_PROXY = proxyUrl;
  process.env.GLOBAL_AGENT_HTTPS_PROXY = proxyUrl;
  process.env.GLOBAL_AGENT_NO_PROXY = noProxy;

  require('global-agent/bootstrap');
  logger.info(`[VPN] Proxy active — routing outbound traffic through ${proxyUrl}`);
}

/**
 * Trigger a VPN reconnect via gluetun's control API.
 * gluetun picks a new server from SERVER_REGIONS on each connect → new IP.
 */
async function rotatePiaIp() {
  const controlUrl = process.env.GLUETUN_CONTROL_URL || 'http://gluetun:8000';

  logger.info('[VPN] Stopping VPN for IP rotation...');
  await gluetunRequest(controlUrl, { status: 'stopped' });

  // Brief pause to allow the tunnel to cleanly tear down
  await new Promise((r) => setTimeout(r, 3000));

  logger.info('[VPN] Reconnecting VPN (new server = new IP)...');
  await gluetunRequest(controlUrl, { status: 'running' });
}

module.exports = { bootstrapVpnProxy, rotatePiaIp };
