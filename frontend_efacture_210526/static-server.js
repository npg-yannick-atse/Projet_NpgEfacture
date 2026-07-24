// Serveur statique zéro-dépendance pour un build React (CRA), avec fallback SPA.
// Équivaut à : serve -s build -l 8048
// Lancement : node static-server.js   (ou : node static-server.js 8080 ./build)

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.argv[2]) || 8048;
const ROOT = path.resolve(__dirname, process.argv[3] || 'build');
const INDEX = path.join(ROOT, 'index.html');
const HOST = '0.0.0.0'; // toutes les interfaces -> accessible depuis le reseau

function getLanIPs() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
};

function sendFile(res, filePath, statusCode = 200) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  res.writeHead(statusCode, { 'Content-Type': type });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  // On ne garde que le chemin (sans query string) et on le décode.
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    urlPath = '/';
  }

  // Résolution sécurisée à l'intérieur de ROOT (anti path-traversal).
  const resolved = path.normalize(path.join(ROOT, urlPath));
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(resolved, (err, stats) => {
    // Fichier statique existant -> on le sert.
    if (!err && stats.isFile()) {
      sendFile(res, resolved);
      return;
    }
    // Dossier -> on tente son index.html.
    if (!err && stats.isDirectory()) {
      const dirIndex = path.join(resolved, 'index.html');
      if (fs.existsSync(dirIndex)) {
        sendFile(res, dirIndex);
        return;
      }
    }
    // Fallback SPA : tout le reste renvoie index.html (React Router gère la route).
    if (fs.existsSync(INDEX)) {
      sendFile(res, INDEX, 200);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found (index.html introuvable dans ' + ROOT + ')');
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log('Serveur statique demarre.');
  console.log('  Dossier : ' + ROOT);
  console.log('  Local   : http://localhost:' + PORT);
  for (const ip of getLanIPs()) {
    console.log('  Reseau  : http://' + ip + ':' + PORT);
  }
  console.log('Ctrl+C pour arreter.');
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error('Le port ' + PORT + ' est deja utilise. Essaie : node static-server.js 8090');
  } else {
    console.error(e.message);
  }
  process.exit(1);
});
