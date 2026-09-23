'use strict';

// Static file server for Green IA. No dependencies: Node core only.
// Serves index.html + assets, with HTTP Range support so the hero video can stream/seek.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;

// Only these extensions are served; anything else (zips, package.json, dotfiles) is a 404.
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

// Server-side files that share a public extension but must never be served.
const PRIVATE = new Set(['server.js']);

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
}

// Client-side routes handled by app.js (History API). A direct load or a
// refresh on any of these must still get index.html from the server, since
// there's no matching file on disk for them.
const SPA_ROUTES = new Set(['/', '/recursos-gratuitos', '/certificate-con-nosotros', '/sobre-nosotros']);

function resolvePath(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split('?')[0]); } catch { return null; }
  if (SPA_ROUTES.has(p)) p = '/index.html';
  else if (p.endsWith('/')) p += 'index.html';
  const full = path.normalize(path.join(ROOT, p));
  if (!full.startsWith(ROOT + path.sep)) return null;
  // Block hidden files/dirs (.claude, .git, …)
  const rel = path.relative(ROOT, full);
  if (rel.split(path.sep).some(seg => seg.startsWith('.')) || PRIVATE.has(rel)) return null;
  return full;
}

// Parses a single "bytes=a-b" range. Returns {start,end}, null (no/ignored range) or 'invalid'.
function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null; // multi-range or malformed: serve full file
  let start, end;
  if (m[1] === '') { // suffix: last N bytes
    const n = Number(m[2]);
    if (n === 0) return 'invalid';
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return 'invalid';
  return { start, end };
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
  }

  const file = resolvePath(req.url);
  const type = file && MIME[path.extname(file).toLowerCase()];
  if (!type) return send(res, 404, 'Not Found');

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, 'Not Found');

    const size = stat.size;
    const headers = {
      'Content-Type': type,
      'Accept-Ranges': 'bytes',
      'Last-Modified': stat.mtime.toUTCString(),
      'X-Content-Type-Options': 'nosniff',
      // HTML always revalidates; media/css/js can be cached briefly
      'Cache-Control': type.startsWith('text/html') ? 'no-cache' : 'public, max-age=86400'
    };

    const range = parseRange(req.headers.range, size);
    if (range === 'invalid') {
      return send(res, 416, 'Range Not Satisfiable', { 'Content-Range': `bytes */${size}` });
    }

    let status = 200;
    let streamOpts;
    if (range) {
      status = 206;
      headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`;
      headers['Content-Length'] = range.end - range.start + 1;
      streamOpts = { start: range.start, end: range.end };
    } else {
      headers['Content-Length'] = size;
    }

    res.writeHead(status, headers);
    if (req.method === 'HEAD') return res.end();

    const stream = fs.createReadStream(file, streamOpts);
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`Green IA listening on port ${PORT}`);
});
