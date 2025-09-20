// server.js – API + SQLite + Sessão + Rotas explícitas

const express = require('express');
const session = require('express-session');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const ROOT = path.resolve(__dirname);

// === Banco SQLite no disco ===
const db = new Database('data.db');
db.prepare(`
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
)
`).run();

// === Middlewares básicos ===
app.use(express.json());

// permitir hosts externos (CORS simples)
app.enable('trust proxy');
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

// sessão simples
app.use(session({
  secret: 'recupera-credito',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8h
}));

// === Servir arquivos estáticos do repositório ===
app.use(express.static(ROOT));

// rotas explícitas pro painel/admin
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(ROOT, 'admin.html'));
});
app.get('/admin.html', (_req, res) => {
  res.sendFile(path.join(ROOT, 'admin.html'));
});

// rota explícita pra home
app.get('/', (_req, res) => {
  res.sendFile(path.join(ROOT, 'index.html'));
});

// exemplo de rota de API para leads
app.get('/api/leads', (req, res) => {
  const rows = db.prepare('SELECT * FROM leads').all();
  res.json(rows);
});

// update status lead
app.patch('/api/leads/:id', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE leads SET status=?, updated_at=datetime("now") WHERE id=?')
    .run(status, req.params.id);
  res.json({ ok: true });
});

// login simples (ADMIN / recupera123)
const USER = 'ADMIN';
const PASS = 'recupera123';

app.post('/login', (req, res) => {
  const { user, pass } = req.body;
  if (user === USER && pass === PASS) {
    req.session.user = user;
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Login inválido' });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// debug: listar arquivos disponíveis
app.get('/debug/files', (_req, res) => {
  const fs = require('fs');
  res.json(fs.readdirSync(ROOT));
});

// === Start Server ===
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log('Servidor rodando na porta', PORT);
});
