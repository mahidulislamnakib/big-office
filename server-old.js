// server.js
const express = require('express');
const bodyParser = require('body-parser');
const Database = require('better-sqlite3');
const path = require('path');
const cors = require('cors');

const DB_FILE = path.join(__dirname, 'data', 'tenders.db');
if (!require('fs').existsSync(DB_FILE)) {
  console.error('Database not found. Run `npm run init-db` first.');
  process.exit(1);
}

const db = new Database(DB_FILE, { readonly: false });
const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper functions
const row = (sql, params = []) => db.prepare(sql).get(params);
const rows = (sql, params = []) => db.prepare(sql).all(params);

// API: list tenders
app.get('/api/tenders', (req, res) => {
  try {
    const list = rows('SELECT id, tender_id, procuring_entity, official, created_at FROM tenders ORDER BY updated_at DESC');
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// API: get tender
app.get('/api/tenders/:id', (req, res) => {
  try {
    const rec = row('SELECT * FROM tenders WHERE id = ?', [req.params.id]);
    if (!rec) return res.status(404).json({ error: 'Not found' });
    res.json(rec);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// API: create or update tender
app.post('/api/tenders', (req, res) => {
  try {
    const data = req.body || {};
    const fields = [
      'tender_id','procuring_entity','official','proc_type','method','briefDesc',
      'itemNo','itemDesc','techSpec','quantity','pod','delivery','invRef',
      'docPrice','lastPurchase','lastSubmission','opening','tSec','validity',
      'liquid','tenderPrep','reqDocs','inspection','contact'
    ];

    if (data.id) {
      const setClause = fields.map(f => `${f} = ?`).join(', ');
      const stmt = db.prepare(`UPDATE tenders SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`);
      const values = fields.map(f => data[f] || '');
      values.push(data.id);
      stmt.run(values);
      return res.json({ ok: true, id: data.id });
    }

    const stmt = db.prepare(
      `INSERT INTO tenders (tender_id,procuring_entity,official,proc_type,method,briefDesc,
        itemNo,itemDesc,techSpec,quantity,pod,delivery,invRef,docPrice,lastPurchase,lastSubmission,
        opening,tSec,validity,liquid,tenderPrep,reqDocs,inspection,contact)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    );

    const values = [
      data.tender_id||'', data.procuring_entity||'', data.official||'', data.proc_type||'', data.method||'', data.briefDesc||'',
      data.itemNo||'', data.itemDesc||'', data.techSpec||'', data.quantity||'', data.pod||'', data.delivery||'', data.invRef||'', data.docPrice||'',
      data.lastPurchase||'', data.lastSubmission||'', data.opening||'', data.tSec||'', data.validity||'', data.liquid||'', data.tenderPrep||'', data.reqDocs||'', data.inspection||'', data.contact||''
    ];

    const info = stmt.run(values);
    res.json({ ok: true, id: info.lastInsertRowid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB write error' });
  }
});

// API: delete
app.delete('/api/tenders/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM tenders WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB delete error' });
  }
});

// Fallback: serve index.html for any other route (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
