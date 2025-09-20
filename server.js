// server.js — API + SQLite + sessão (Render/Free OK)

const express  = require('express');
const session  = require('express-session');
const path     = require('path');
const Database = require('better-sqlite3');

const app = express();

/* ======================
   1) Banco de dados
   ====================== */

const db = new Database('data.db'); // Render persiste enquanto o serviço existir

// Cria tabela caso não exista
db.prepare(`
CREATE TABLE IF NOT EXISTS leads (
  id          INTEGER PRIMARY KEY,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  tipo        TEXT NOT NULL CHECK (tipo IN ('PF','PJ')),
  nome        TEXT NOT NULL,
  whatsapp    TEXT,
  cidade      TEXT,
  tempo       TEXT,
  limite      REAL,
  status      TEXT DEFAULT 'Novo',
  notas       TEXT,
  extra       TEXT
)
`).run();

/* ======================
   2) Middlewares base
   ====================== */

app.use(express.json());

// Render fica atrás de proxy → isso permite cookie.secure funcionar via HTTPS
app.enable('trust proxy');

// CORS simples (se quiser travar, troque * pelo seu domínio)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Sessão (para proteger /admin e /api)
app.use(session({
  name: 'sid',
  secret: 'recupera-credito-secret',          // troque em produção
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 8,               // 8h
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' // em produção só via HTTPS
  }
}));

/* ======================
   3) Páginas (rotas HTML)
   ====================== */

// Página pública
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Guard de autenticação
function requireAuth(req, res, next) {
  if (req.session && req.session.uid === 'ok') return next();
  return res.status(401).json({ ok: false });
}

// Admin protegido — definimos ANTES do static para não vazar
app.get('/admin.html', requireAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

/* ======================
   4) Arquivos estáticos
   ====================== */

// Depois das rotas acima, para que /admin.html não seja servido sem checagem
app.use(express.static(path.join(__dirname)));

/* ======================
   5) Autenticação simples
   ====================== */

const USER = 'ADMIN';
const PASS = 'recupera123';

app.post('/login', (req, res) => {
  const { user, pass } = req.body || {};
  if (user === USER && pass === PASS) {
    req.session.uid = 'ok';
    return res.json({ ok: true });
  }
  res.status(401).json({ ok: false, msg: 'invalid' });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

/* ======================
   6) API
   ====================== */

// LISTAR leads — **PROTEGIDO** (só logado visualiza dados)
app.get('/api/leads', requireAuth, (_req, res) => {
  const rows = db.prepare(
    `SELECT * FROM leads ORDER BY datetime(created_at) DESC`
  ).all();
  res.json(rows);
});

// CRIAR lead — **PÚBLICO** (form do site)
app.post('/api/leads', (req, res) => {
  const d = req.body || {};

  // Validação mínima para evitar “lixo”
  if (!d.nome || !d.whatsapp) {
    return res.status(400).json({ ok: false, msg: 'Nome e WhatsApp são obrigatórios.' });
  }

  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO leads (created_at, updated_at, tipo, nome, whatsapp, cidade, tempo, limite, status, notas, extra)
    VALUES (@created_at, @updated_at, @tipo, @nome, @whatsapp, @cidade, @tempo, @limite, @status, @notas, @extra)
  `);

  const info = stmt.run({
    created_at: now,
    updated_at: now,
    tipo: d.tipo === 'PJ' ? 'PJ' : 'PF',
    nome: d.nome.trim(),
    whatsapp: d.whatsapp.trim(),
    cidade: (d.cidade || '').trim(),
    tempo: (d.tempo || '').trim(),
    limite: d.limite !== undefined && d.limite !== '' ? Number(d.limite) : null,
    status: 'Novo',
    notas: (d.notas || '').trim(),
    extra: (d.extra || '').trim()
  });

  res.json({ ok: true, id: info.lastInsertRowid });
});

// ATUALIZAR status — **PROTEGIDO**
app.patch('/api/leads/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};
  if (!id || !status) return res.status(400).json({ ok: false });

  db.prepare(
    `UPDATE leads SET status=@status, updated_at=@u WHERE id=@id`
  ).run({ status, id, u: new Date().toISOString() });

  res.json({ ok: true });
});

// (Opcional) Apagar lead — **PROTEGIDO**
app.delete('/api/leads/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ ok: false });
  db.prepare(`DELETE FROM leads WHERE id=@id`).run({ id });
  res.json({ ok: true });
});

// Healthcheck para Render
app.get('/healthz', (_req, res) => res.json({ ok: true }));

/* ======================
   7) Start
   ====================== */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Servidor ON ::', PORT));
