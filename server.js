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
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
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

// Short addresses for standalone pages (served without a trailing slash).
const PAGE_ROUTES = {
  '/test': '/consciente/index.html',
  '/consciente': '/consciente/index.html',
  '/calculadora': '/calculadora/index.html',
  '/huella': '/calculadora/index.html'
};

// Permanent redirects so each page has one canonical address.
const REDIRECTS = {
  '/consciente': '/test',
  '/consciente/': '/test',
  '/huella': '/calculadora',
  '/calculadora/': '/calculadora',
  '/index.html': '/'
};

const SITE = 'https://somosgreenia.com';

// Per-route metadata for the single-page routes (index.html is shared, so the
// server rewrites title, description, canonical and Open Graph for crawlers).
const ROUTE_META = {
  '/': {
    title: 'somosgreenia · Primero criterio, luego IA',
    description: 'somosgreenia te enseña a usar la IA con responsabilidad y eficiencia, sin tecnicismos. Primero criterio, luego IA.'
  },
  '/recursos-gratuitos': {
    title: 'Recursos gratuitos para usar la IA con criterio · somosgreenia',
    description: 'Test de hábitos, calculadora de la huella de la IA y glosario sin jerga. Gratis y sin registro.'
  },
  '/certificate-con-nosotros': {
    title: 'Certifícate con nosotros · somosgreenia',
    description: 'Estamos construyendo una certificación de hábitos para el uso responsable y eficiente de la IA, para personas y empresas. En construcción.'
  },
  '/sobre-nosotros': {
    title: 'Sobre nosotros · somosgreenia',
    description: 'Qué es somosgreenia, cómo trabajamos y por qué creemos que primero va el criterio y luego la IA.'
  }
};

const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function withMeta(html, route) {
  const m = ROUTE_META[route];
  if (!m) return html;
  const url = SITE + (route === '/' ? '/' : route);
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(m.title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(m.description)}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(m.title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(m.description)}$2`);
}

const SITEMAP_URLS = ['/', '/recursos-gratuitos', '/certificate-con-nosotros', '/sobre-nosotros', '/test', '/calculadora'];

function sitemapXml() {
  const today = new Date().toISOString().slice(0, 10);
  const items = SITEMAP_URLS.map(u => `  <url><loc>${SITE}${u === '/' ? '/' : u}</loc><lastmod>${today}</lastmod></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>\n`;
}

const ROBOTS = `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`;

function resolvePath(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split('?')[0]); } catch { return null; }
  if (SPA_ROUTES.has(p)) p = '/index.html';
  else if (PAGE_ROUTES[p]) p = PAGE_ROUTES[p];
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

  const urlPath = req.url.split('?')[0];
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  if (REDIRECTS[urlPath]) return send(res, 301, 'Moved Permanently', { Location: REDIRECTS[urlPath] + qs });
  if (urlPath === '/robots.txt') {
    return send(res, 200, ROBOTS, { 'Cache-Control': 'public, max-age=3600' });
  }
  if (urlPath === '/sitemap.xml') {
    return send(res, 200, sitemapXml(), { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
  }
  if (urlPath === '/favicon.ico') req.url = '/favicon.ico';

  // Single-page routes: serve index.html with route-specific metadata.
  if (ROUTE_META[urlPath]) {
    return fs.readFile(path.join(ROOT, 'index.html'), 'utf8', (err, html) => {
      if (err) return send(res, 404, 'Not Found');
      const body = Buffer.from(withMeta(html, urlPath), 'utf8');
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Content-Length': body.length, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : body);
    });
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
