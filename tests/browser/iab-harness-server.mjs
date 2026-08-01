import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = '127.0.0.1';
const DEFAULT_PORT = 4173;
const localDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(localDirectory, '..', '..');
const harnessPath = resolve(localDirectory, 'iab-harness.html');
const userscriptPath = resolve(repositoryRoot, 'primer-pp.user.js');

function parsePort(value) {
    if (value === undefined) return DEFAULT_PORT;
    if (!/^\d+$/u.test(value)) throw new TypeError('Port must be an integer from 1 to 65535');
    const port = Number(value);
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
        throw new RangeError('Port must be an integer from 1 to 65535');
    }
    return port;
}

const PORT = parsePort(process.argv[2]);
const allowedHosts = new Set([
    `${HOST}:${PORT}`,
    `localhost:${PORT}`
]);

const securityHeaders = Object.freeze({
    'Cache-Control': 'no-store',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff'
});

function send(response, status, body, contentType, method = 'GET', extraHeaders = {}) {
    const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    response.writeHead(status, {
        ...securityHeaders,
        ...extraHeaders,
        'Content-Type': contentType,
        'Content-Length': payload.byteLength
    });
    response.end(method === 'HEAD' ? undefined : payload);
}

function reject(response, status, message, method, extraHeaders = {}) {
    send(response, status, `${message}\n`, 'text/plain; charset=utf-8', method, extraHeaders);
}

function safePathname(requestTarget) {
    if (typeof requestTarget !== 'string' || !requestTarget.startsWith('/')) return null;
    const rawPath = requestTarget.split(/[?#]/u, 1)[0];
    if (!rawPath || rawPath.includes('\\') || rawPath.includes('\0') || rawPath.includes('%')) return null;
    const segments = rawPath.split('/');
    if (segments.some(segment => segment === '.' || segment === '..')) return null;
    return rawPath;
}

async function serveFile(response, path, contentType, method) {
    try {
        const body = await readFile(path);
        send(response, 200, body, contentType, method, {
            'Content-Security-Policy': "default-src 'self'; base-uri 'none'; connect-src 'none'; form-action 'none'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
        });
    } catch (error) {
        const status = error?.code === 'ENOENT' ? 503 : 500;
        reject(response, status, 'Harness artifact is unavailable', method);
    }
}

const server = createServer(async (request, response) => {
    const method = request.method || 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
        reject(response, 405, 'Method not allowed', method, { Allow: 'GET, HEAD' });
        return;
    }

    if (!allowedHosts.has(String(request.headers.host || '').toLowerCase())) {
        reject(response, 400, 'Invalid Host header', method);
        return;
    }

    const pathname = safePathname(request.url);
    if (pathname === null) {
        reject(response, 400, 'Invalid request path', method);
        return;
    }

    if (pathname === '/' || pathname === '/app/fixture') {
        await serveFile(response, harnessPath, 'text/html; charset=utf-8', method);
        return;
    }
    if (pathname === '/primer-pp.user.js') {
        await serveFile(response, userscriptPath, 'text/javascript; charset=utf-8', method);
        return;
    }
    if (pathname === '/healthz') {
        send(response, 200, JSON.stringify({
            ok: true,
            service: 'primer-pp-iab-harness',
            host: HOST
        }), 'application/json; charset=utf-8', method);
        return;
    }

    reject(response, 404, 'Not found', method);
});

server.on('clientError', (_error, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
});

server.on('error', error => {
    console.error(`[primer-iab-harness] ${error.message}`);
    process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
    console.log(`[primer-iab-harness] http://${HOST}:${PORT}/app/fixture`);
    console.log(`[primer-iab-harness] health: http://${HOST}:${PORT}/healthz`);
});
