// server.js — API + estáticos + sessão (Render/Free OK)
const express = require('express');
const session = require('express-session');
const path = require('path');
const Database = require('better-sqlite3');

// ====== DB ======
const db = new Database('data.db');

// cria tabela se não existir
db.exec(`
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('PF','PJ')),
  nome TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  cidade TEXT,
  tempo TEXT,
  limite REAL,
  status TEXT DEFAULT 'Novo',
  notas TEXT,
  extra TEXT
);
`);

// ====== APP ======
const app = express();
app.use(express.json());

// permitir proxy do Render e CORS simples
app.enable('trust proxy');
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

// sessão simples (apenas para proteger /api)
app.use(session({
  secret: 'recupera-credito',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8h
}));

// servir arquivos estáticos da RAIZ do repo (index.html, admin.html)
const ROOT = __dirname;
app.use(express.static(ROOT));

// rotas explícitas para garantir que admin.html e index.html funcionem
app.get('/', (_req, res) => {
  res.sendFile(path.join(ROOT, 'index.html'));
});
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(ROOT, 'admin.html'));
});
app.get('/admin.html', (_req, res) => {
  res.sendFile(path.join(ROOT, 'admin.html'));
});

// --- auth super simples ---
const USER = 'ADMIN';
const PASS = 'recupera123';

app.post('/login', (req, res) => {
  const { user, pass } = req.body || {};
  if ((user || '').toUpperCase() === USER && pass === PASS) {
    req.session.auth = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ ok: false, error: 'unauthorized' });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// middleware de proteção das rotas /api
function mustAuth(req, res, next) {
  if (req.session?.auth) return next();
  return res.status(401).json({ ok: false, error: 'auth' });
}

// ====== API Leads ======
app.get('/api/leads', mustAuth, (_req, res) => {
  const rows = db.prepare('SELECT * FROM leads ORDER BY datetime(created_at) DESC').all();
  res.json(rows);
});

app.post('/api/leads', (_req, res) => {
  // pública (vinda do formulário do site)
  const body = _req.body || {};
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO leads (created_at, updated_at, tipo, nome, whatsapp, cidade, tempo, limite, status, notas, extra)
    VALUES (@created_at, @updated_at, @tipo, @nome, @whatsapp, @cidade, @tempo, @limite, 'Novo', @notas, @extra)
  `);
  const info = stmt.run({
    created_at: now,
    updated_at: now,
    tipo: (body.tipo || 'PF').toUpperCase() === 'PJ' ? 'PJ' : 'PF',
    nome: body.nome || '',
    whatsapp: body.whatsapp || '',
    cidade: body.cidade || '',
    tempo: body.tempo || '',
    limite: body.limite ?? null,
    notas: body.notas || '',
    extra: body.extra || ''
  });
  res.json({ ok: true, id: info.lastInsertRowid });
});

app.patch('/api/leads/:id', mustAuth, (req, res) => {
  const id = Number(req.params.id);
  const { status, notas } = req.body || {};
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE leads SET
      status = COALESCE(@status, status),
      notas = COALESCE(@notas, notas),
      updated_at = @updated_at
    WHERE id = @id
  `);
  stmt.run({ id, status, notas, updated_at: now });
  res.json({ ok: true });
});

app.delete('/api/leads/:id', mustAuth, (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM leads WHERE id = ?').run(id);
  res.json({ ok: true });
});

// healthcheck opcional
app.get('/healthz', (_req, res) => res.send('ok'));

// 404 amigável para APIs
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ ok: false, error: 'not-found' });
  }
  res.status(404).send('Not Found');
});

// ====== START ======
const PORT = process.env.PORT || 3000;     // *** IMPORTANTE no Render ***
app.listen(PORT, '0.0.0.0', () => {
  console.log(`server up on ${PORT}`);
});
