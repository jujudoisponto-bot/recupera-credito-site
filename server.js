// server.js — API + SQLite + sessão (Render/Free OK)
const express = require('express');
const session = require('express-session');
const path = require('path');
const Database = require('better-sqlite3');

// Banco SQLite no disco (Render persiste enquanto o serviço existir)
const db = new Database('data.db');

// Cria tabela caso não exista
db.prepare(`
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('PF','PJ')),
  nome TEXT NOT NULL,
  whatsapp TEXT,
  cidade TEXT,
  tempo TEXT,
  limite REAL,
  status TEXT DEFAULT 'Novo',
  notas TEXT,
  extra TEXT
)
`).run();

const app = express();
app.use(express.json());

// permitir hosts externos (proxy + CORS simples)
app.enable('trust proxy');
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// sessão simples (apenas para proteger /admin e /api/* de escrita)
app.use(session({
  secret: 'recupera-credito-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8h
}));

// servir arquivos estáticos (index.html, admin.html)
app.use(express.static(path.join(__dirname)));

// rotas de páginas
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// auth bem simples (ADMIN / recupera123)
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

// helper: exigir login
function requireAuth(req, res, next) {
  if (req.session && req.session.uid === 'ok') return next();
  return res.status(401).json({ ok: false });
}

// ===== API =====

// lista leads (sem exigir login para leitura do painel ao abrir; se quiser, troque para requireAuth)
app.get('/api/leads', (req, res) => {
  const rows = db.prepare(`SELECT * FROM leads ORDER BY datetime(created_at) DESC`).all();
  res.json(rows);
});

// cria lead (poderia ser usado por um form público)
app.post('/api/leads', (req, res) => {
  const d = req.body || {};
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO leads (created_at, updated_at, tipo, nome, whatsapp, cidade, tempo, limite, status, notas, extra)
    VALUES (@created_at, @updated_at, @tipo, @nome, @whatsapp, @cidade, @tempo, @limite, @status, @notas, @extra)
  `);
  const info = stmt.run({
    created_at: now,
    updated_at: now,
    tipo: d.tipo || 'PF',
    nome: d.nome || '',
    whatsapp: d.whatsapp || '',
    cidade: d.cidade || '',
    tempo: d.tempo || '',
    limite: d.limite ?? null,
    status: d.status || 'Novo',
    notas: d.notas || '',
    extra: d.extra || ''
  });
  res.json({ ok: true, id: info.lastInsertRowid });
});

// atualiza status (exige login)
app.patch('/api/leads/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};
  if (!id || !status) return res.status(400).json({ ok: false });

  db.prepare(`UPDATE leads SET status=@status, updated_at=@u WHERE id=@id`)
    .run({ status, id, u: new Date().toISOString() });

  res.json({ ok: true });
});

// saúde
app.get('/healthz', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Servidor ON :', PORT));
