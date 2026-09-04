'use strict';

// Load .env (no external dependency — tiny inline parser)
const fs = require('node:fs');
const path = require('node:path');
(function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
})();

const http = require('node:http');
const { URL } = require('node:url');

const auth = require('./src/auth');
const { seedAdmin } = require('./src/seed');
const authRoutes = require('./src/routes/auth-routes');
const studentRoutes = require('./src/routes/student-routes');
const adminRoutes = require('./src/routes/admin-routes');
const { sendJson } = require('./src/utils/http');
const { UPLOAD_DIR } = require('./src/utils/photo');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

seedAdmin();

// ---------- Static file serving (public/ and uploads/photos/) ----------
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function safeJoin(base, requestPath) {
  const resolved = path.normalize(path.join(base, requestPath));
  if (!resolved.startsWith(base)) return null; // path traversal guard
  return resolved;
}

function serveStaticFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function tryServeStatic(req, res, pathname) {
  if (pathname.startsWith('/uploads/photos/')) {
    // Only ever serve files that live under uploads/photos, with safe-join to block traversal.
    const rel = pathname.replace('/uploads/photos/', '');
    const filePath = safeJoin(UPLOAD_DIR, rel);
    if (!filePath || !fs.existsSync(filePath)) return false;
    serveStaticFile(res, filePath);
    return true;
  }

  let rel = pathname === '/' ? '/index.html' : pathname;
  // Clean, extension-less URLs map to matching .html files (e.g. /student/dashboard -> student/dashboard.html)
  let filePath = safeJoin(PUBLIC_DIR, rel);
  if (!filePath) return false;

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    serveStaticFile(res, filePath);
    return true;
  }
  if (!path.extname(rel)) {
    const withHtml = safeJoin(PUBLIC_DIR, `${rel}.html`);
    if (withHtml && fs.existsSync(withHtml)) {
      serveStaticFile(res, withHtml);
      return true;
    }
  }
  return false;
}

// ---------- Auth middleware ----------
function attachUser(req) {
  const token = auth.getSessionTokenFromReq(req);
  req.user = auth.getUserBySession(token);
}

function requireRole(req, res, role) {
  if (!req.user) {
    sendJson(res, 401, { error: 'Authentication required.' });
    return false;
  }
  if (req.user.role !== role) {
    sendJson(res, 403, { error: 'You are not authorized to perform this action.' });
    return false;
  }
  return true;
}

// ---------- Router ----------
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);
    const method = req.method;

    attachUser(req);

    // --- API routes ---
    if (pathname.startsWith('/api/')) {
      // Auth
      if (pathname === '/api/auth/register' && method === 'POST')
        return await authRoutes.registerStudent(req, res);
      if (pathname === '/api/auth/login' && method === 'POST')
        return await authRoutes.studentLogin(req, res);
      if (pathname === '/api/auth/admin/login' && method === 'POST')
        return await authRoutes.adminLogin(req, res);
      if (pathname === '/api/auth/logout' && method === 'POST') return await authRoutes.logout(req, res);
      if (pathname === '/api/auth/me' && method === 'GET') return authRoutes.me(req, res);

      // Student (role-protected)
      if (pathname.startsWith('/api/student/')) {
        if (!requireRole(req, res, 'student')) return;

        if (pathname === '/api/student/profile' && method === 'GET')
          return studentRoutes.getProfile(req, res);
        if (pathname === '/api/student/application' && method === 'POST')
          return await studentRoutes.applyForIdCard(req, res);
        if (pathname === '/api/student/application' && method === 'GET')
          return studentRoutes.getLatestApplication(req, res);
        const appMatch = pathname.match(/^\/api\/student\/application\/([A-Za-z0-9-]+)$/);
        if (appMatch && method === 'GET')
          return studentRoutes.getApplicationByNumber(req, res, appMatch[1]);
        if (pathname === '/api/student/idcard' && method === 'GET')
          return studentRoutes.getIdCard(req, res, url.searchParams.get('format') || 'json');

        return sendJson(res, 404, { error: 'Not found.' });
      }

      // Admin (role-protected)
      if (pathname.startsWith('/api/admin/')) {
        if (!requireRole(req, res, 'admin')) return;

        if (pathname === '/api/admin/stats' && method === 'GET')
          return adminRoutes.getStats(req, res);
        if (pathname === '/api/admin/applications' && method === 'GET')
          return adminRoutes.listApplications(req, res, url.searchParams);
        if (pathname === '/api/admin/students' && method === 'GET')
          return adminRoutes.listStudents(req, res, url.searchParams);

        const idMatch = pathname.match(/^\/api\/admin\/applications\/(\d+)$/);
        if (idMatch) {
          const id = Number(idMatch[1]);
          if (method === 'GET') return adminRoutes.getApplication(req, res, id);
          if (method === 'PUT') return await adminRoutes.updateApplication(req, res, id);
        }
        const approveMatch = pathname.match(/^\/api\/admin\/applications\/(\d+)\/approve$/);
        if (approveMatch && method === 'POST')
          return await adminRoutes.approveApplication(req, res, Number(approveMatch[1]));
        const rejectMatch = pathname.match(/^\/api\/admin\/applications\/(\d+)\/reject$/);
        if (rejectMatch && method === 'POST')
          return await adminRoutes.rejectApplication(req, res, Number(rejectMatch[1]));
        const idcardMatch = pathname.match(/^\/api\/admin\/applications\/(\d+)\/idcard$/);
        if (idcardMatch && method === 'GET')
          return adminRoutes.previewIdCard(
            req,
            res,
            Number(idcardMatch[1]),
            url.searchParams.get('format') || 'json'
          );

        return sendJson(res, 404, { error: 'Not found.' });
      }

      return sendJson(res, 404, { error: 'Not found.' });
    }

    // --- Static frontend ---
    if (method === 'GET' && tryServeStatic(req, res, pathname)) return;

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: 'Internal server error.' });
  }
});

server.listen(PORT, () => {
  console.log(`GPC Hanumangarh ID Card Portal running at http://localhost:${PORT}`);
});
