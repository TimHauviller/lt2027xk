import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc,
  collection, getDocs, onSnapshot, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const app = initializeApp(firebaseConfig);
const db = getAuth ? getFirestore(app) : null;
const auth = getAuth(app);

// ---------------------------------------------------------------
// Default (Beispiel-)Kategorien, die der Admin per Knopfdruck einfügen kann
// ---------------------------------------------------------------
const DEFAULT_CATEGORIES = [
  { title: "Kleidermodus", icon: "👗", type: "info", order: 0,
    content: "Wir wünschen uns elegante Sommerkleidung. Details folgen." },
  { title: "Unterkunft", icon: "🏡", type: "info", order: 1,
    content: "Infos zu Unterkünften folgen in Kürze." },
  { title: "Anreise", icon: "✈️", type: "info", order: 2,
    content: "Anreise per Flug nach Pisa oder Florenz, oder mit dem Auto. Die genaue Adresse bekommt ihr rechtzeitig vor der Hochzeit." },
  { title: "Ablauf der Abende", icon: "🌙", type: "info", order: 3,
    content: "Den genauen Ablauf geben wir vor Ort bekannt.", countdownTo: "" },
  { title: "Essen & Getränke", icon: "🍝", type: "form", order: 4,
    fields: [
      { key: "ernaehrung", label: "Ernährung", type: "select", options: ["Fleisch", "Vegetarisch", "Vegan"] },
      { key: "allergien", label: "Allergien / Unverträglichkeiten", type: "textarea" },
      { key: "getraenke", label: "Wunschgetränke", type: "text" }
    ] },
  { title: "Packliste", icon: "🧳", type: "info", order: 5,
    content: "Denkt an: Sonnenschutz, bequeme Schuhe, ein Outfit für den Abend..." },
  { title: "Abreise", icon: "🚗", type: "info", order: 6,
    content: "Infos zur Abreise folgen." },
  { title: "Überweisung", icon: "💶", type: "info", order: 7,
    content: "Betrag, IBAN und Frist folgen." },
  { title: "Ansprechpartnerinnen", icon: "📞", type: "info", order: 8,
    content: "Bei Fragen meldet euch bei ..." },
  { title: "Hochzeitsgeschenke", icon: "🎁", type: "info", order: 9,
    content: "Über eure Anwesenheit freuen wir uns am meisten. Wer möchte, findet hier weitere Infos." }
];

// ---------------------------------------------------------------
// State
// ---------------------------------------------------------------
let state = {
  config: null,
  categories: [],
  guests: [],
  responses: [],
  currentGuest: JSON.parse(localStorage.getItem('hz_guest') || 'null'),
  isAdmin: false
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function showScreen(id) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

// ---------------------------------------------------------------
// Config (Landing-Page-Inhalte)
// ---------------------------------------------------------------
async function loadConfig() {
  const ref = doc(db, 'config', 'general');
  const snap = await getDoc(ref);
  if (snap.exists()) {
    state.config = snap.data();
  } else {
    state.config = {
      title: "Lucie & Timmy",
      subtitle: "Wir heiraten in der Toskana, Italien 🇮🇹",
      intro: "9. – 13. Mai 2027",
      photoUrl: "",
      weddingStart: "2027-05-09",
      weddingEnd: "2027-05-13"
    };
  }
  renderConfig();
}

function renderConfig() {
  const c = state.config;
  $('#landing-title').textContent = c.title;
  $('#main-title').textContent = c.title;
  $('#landing-subtitle').textContent = c.subtitle;
  $('#landing-intro').textContent = c.intro;
  if (c.photoUrl) {
    $('#landing-photo').style.backgroundImage = `url(${c.photoUrl})`;
  }
  $('#marquee-track').textContent = `${c.title || 'Lucie & Timmy'}  •  Toskana, Italien  •  ${c.intro || ''}`;
  // Admin-Formular vorbefüllen
  $('#cfg-title').value = c.title || '';
  $('#cfg-subtitle').value = c.subtitle || '';
  $('#cfg-intro').value = c.intro || '';
  $('#cfg-photo').value = c.photoUrl || '';
  $('#cfg-start').value = c.weddingStart || '';
  $('#cfg-end').value = c.weddingEnd || '';
}

async function saveConfig() {
  const newConfig = {
    title: $('#cfg-title').value.trim(),
    subtitle: $('#cfg-subtitle').value.trim(),
    intro: $('#cfg-intro').value.trim(),
    photoUrl: $('#cfg-photo').value.trim(),
    weddingStart: $('#cfg-start').value,
    weddingEnd: $('#cfg-end').value
  };
  await setDoc(doc(db, 'config', 'general'), newConfig);
  state.config = newConfig;
  renderConfig();
  startCountdowns();
  $('#config-saved-msg').classList.remove('hidden');
  setTimeout(() => $('#config-saved-msg').classList.add('hidden'), 2000);
}

// ---------------------------------------------------------------
// Countdown
// ---------------------------------------------------------------
function startCountdowns() {
  if (window.__cdInterval) clearInterval(window.__cdInterval);
  const tick = () => {
    if (!state.config || !state.config.weddingStart) return;
    const target = new Date(state.config.weddingStart + 'T00:00:00');
    const diff = target - new Date();
    const d = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
    const h = Math.max(0, Math.floor((diff / (1000 * 60 * 60)) % 24));
    const m = Math.max(0, Math.floor((diff / (1000 * 60)) % 60));
    const s = Math.max(0, Math.floor((diff / 1000) % 60));
    $('#cd-days').textContent = d;
    $('#cd-hours').textContent = h;
    $('#cd-minutes').textContent = m;
    $('#cd-seconds').textContent = s;
    $('#mini-countdown').textContent = diff > 0 ? `${d} Tage bis zur Hochzeit` : `Es ist soweit! 🎉`;

    // Kategorien mit eigenem Countdown aktualisieren
    $$('.category-countdown[data-target]').forEach(el => {
      const t = new Date(el.dataset.target);
      const dd = t - new Date();
      if (dd <= 0) { el.textContent = 'Es ist soweit!'; return; }
      const days = Math.floor(dd / (1000 * 60 * 60 * 24));
      const hrs = Math.floor((dd / (1000 * 60 * 60)) % 24);
      el.textContent = `Noch ${days} Tage, ${hrs} Std.`;
    });
  };
  tick();
  window.__cdInterval = setInterval(tick, 1000);
}

// ---------------------------------------------------------------
// Kategorien laden & rendern (Gast-Ansicht)
// ---------------------------------------------------------------
async function loadCategories() {
  const q = query(collection(db, 'categories'), orderBy('order', 'asc'));
  const snap = await getDocs(q);
  state.categories = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderCategories();
}

function renderCategories() {
  const list = $('#categories-list');
  list.innerHTML = '';
  if (state.categories.length === 0) {
    list.innerHTML = '<p class="muted">Noch keine Kategorien vorhanden. Der Admin kann welche anlegen.</p>';
    return;
  }
  state.categories.forEach(cat => {
    const el = document.createElement('div');
    el.className = 'category';
    el.innerHTML = `
      <div class="category-header">
        <span>${cat.icon || ''}</span>
        <span>${escapeHtml(cat.title)}</span>
        <span class="chevron">▶</span>
      </div>
      <div class="category-body"></div>
    `;
    el.querySelector('.category-header').addEventListener('click', () => {
      el.classList.toggle('open');
    });
    const body = el.querySelector('.category-body');

    if (cat.countdownTo) {
      const cd = document.createElement('div');
      cd.className = 'category-countdown';
      cd.dataset.target = cat.countdownTo;
      body.appendChild(cd);
    }

    if (cat.type === 'form') {
      body.appendChild(renderFormFields(cat));
    } else {
      const p = document.createElement('div');
      p.innerHTML = escapeHtml(cat.content || '').replace(/\n/g, '<br>');
      body.appendChild(p);
    }
    list.appendChild(el);
  });
  startCountdowns();
}

function renderFormFields(cat) {
  const wrap = document.createElement('div');
  const existing = state.currentGuest
    ? (state.responses.find(r => r.id === state.currentGuest.id)?.answers?.[cat.id] || {})
    : {};

  (cat.fields || []).forEach(f => {
    const group = document.createElement('div');
    group.className = 'field-group';
    const label = document.createElement('label');
    label.textContent = f.label;
    group.appendChild(label);

    let input;
    if (f.type === 'select') {
      input = document.createElement('select');
      input.innerHTML = '<option value="">– Bitte wählen –</option>' +
        (f.options || []).map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
      input.value = existing[f.key] || '';
    } else if (f.type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = 2;
      input.value = existing[f.key] || '';
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.value = existing[f.key] || '';
    }
    input.addEventListener('change', () => saveGuestAnswer(cat.id, f.key, input.value));
    group.appendChild(input);
    wrap.appendChild(group);
  });

  const hint = document.createElement('p');
  hint.className = 'saved-hint';
  hint.textContent = state.currentGuest ? '' : 'Bitte wähle zuerst deinen Namen aus, um Angaben zu speichern.';
  wrap.appendChild(hint);
  return wrap;
}

async function saveGuestAnswer(categoryId, key, value) {
  if (!state.currentGuest) return;
  const ref = doc(db, 'responses', state.currentGuest.id);
  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : { guestName: state.currentGuest.name, answers: {} };
  data.answers = data.answers || {};
  data.answers[categoryId] = { ...(data.answers[categoryId] || {}), [key]: value };
  data.guestName = state.currentGuest.name;
  data.updatedAt = new Date().toISOString();
  await setDoc(ref, data);
}

// ---------------------------------------------------------------
// Gäste
// ---------------------------------------------------------------
async function loadGuests() {
  const snap = await getDocs(collection(db, 'guests'));
  state.guests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderGuestSelect();
  renderAdminGuests();
}

function renderGuestSelect() {
  const sel = $('#guest-select');
  sel.innerHTML = '<option value="">– Bitte auswählen –</option>' +
    state.guests
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
}

// ---------------------------------------------------------------
// Utility
// ---------------------------------------------------------------
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// ---------------------------------------------------------------
// Event-Listener: Landing / Gast-Auswahl / Hauptseite
// ---------------------------------------------------------------
$('#btn-enter').addEventListener('click', () => {
  if (state.currentGuest) {
    enterMain();
  } else {
    showScreen('#screen-guest');
  }
});

$('#guest-select').addEventListener('change', (e) => {
  $('#btn-guest-continue').disabled = !e.target.value;
});

$('#btn-guest-continue').addEventListener('click', async () => {
  const id = $('#guest-select').value;
  const guest = state.guests.find(g => g.id === id);
  if (!guest) return;
  state.currentGuest = { id: guest.id, name: guest.name };
  localStorage.setItem('hz_guest', JSON.stringify(state.currentGuest));
  await loadResponsesForCurrentGuest();
  enterMain();
});

$('#btn-switch-guest').addEventListener('click', () => {
  state.currentGuest = null;
  localStorage.removeItem('hz_guest');
  showScreen('#screen-guest');
});

function enterMain() {
  $('#main-greeting').textContent = state.currentGuest ? `Hallo, ${state.currentGuest.name}!` : '';
  renderCategories();
  showScreen('#screen-main');
}

async function loadResponsesForCurrentGuest() {
  if (!state.currentGuest) return;
  const ref = doc(db, 'responses', state.currentGuest.id);
  const snap = await getDoc(ref);
  state.responses = snap.exists() ? [{ id: state.currentGuest.id, ...snap.data() }] : [];
}

// ---------------------------------------------------------------
// Admin: Login
// ---------------------------------------------------------------
$('#btn-open-admin').addEventListener('click', () => {
  $('#admin-login-modal').classList.remove('hidden');
});
$('#btn-admin-login-cancel').addEventListener('click', () => {
  $('#admin-login-modal').classList.add('hidden');
});
$('#btn-admin-login-submit').addEventListener('click', async () => {
  const email = $('#admin-email').value.trim();
  const pw = $('#admin-password').value;
  try {
    await signInWithEmailAndPassword(auth, email, pw);
    $('#admin-login-modal').classList.add('hidden');
    $('#admin-login-error').classList.add('hidden');
  } catch (err) {
    $('#admin-login-error').textContent = 'Login fehlgeschlagen. E-Mail/Passwort prüfen.';
    $('#admin-login-error').classList.remove('hidden');
  }
});
$('#btn-admin-logout').addEventListener('click', async () => {
  await signOut(auth);
  showScreen('#screen-main');
});
$('#btn-admin-back').addEventListener('click', () => showScreen('#screen-main'));

onAuthStateChanged(auth, async (user) => {
  state.isAdmin = !!user;
  if (user) {
    await loadAdminData();
    showScreen('#screen-admin');
  }
});

// ---------------------------------------------------------------
// Admin: Tabs
// ---------------------------------------------------------------
$$('.admin-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.admin-tab').forEach(t => t.classList.remove('active'));
    $$('.admin-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    $(`#admin-panel-${tab.dataset.tab}`).classList.add('active');
  });
});

$('#btn-save-config').addEventListener('click', saveConfig);

// ---------------------------------------------------------------
// Admin: Kategorien verwalten
// ---------------------------------------------------------------
async function loadAdminData() {
  await loadCategoriesAdmin();
  await loadGuests();
  await loadAllResponses();
}

async function loadCategoriesAdmin() {
  const q = query(collection(db, 'categories'), orderBy('order', 'asc'));
  const snap = await getDocs(q);
  state.categories = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderAdminCategories();
}

function renderAdminCategories() {
  const wrap = $('#admin-categories-list');
  wrap.innerHTML = '';
  state.categories.forEach((cat, idx) => {
    const el = document.createElement('div');
    el.className = 'admin-cat-item';
    el.innerHTML = `
      <div class="admin-cat-item-header">
        <button class="icon-btn" data-action="up">↑</button>
        <button class="icon-btn" data-action="down">↓</button>
        <strong>${escapeHtml(cat.title)}</strong>
        <button class="icon-btn" data-action="delete">🗑</button>
      </div>
      <label>Titel</label>
      <input type="text" data-field="title" value="${escapeHtml(cat.title)}">
      <label>Icon (Emoji, optional)</label>
      <input type="text" data-field="icon" value="${escapeHtml(cat.icon || '')}">
      <label>Typ</label>
      <select data-field="type">
        <option value="info" ${cat.type === 'info' ? 'selected' : ''}>Info-Text</option>
        <option value="form" ${cat.type === 'form' ? 'selected' : ''}>Formular für Gäste</option>
      </select>
      <div class="cat-info-block" style="${cat.type === 'form' ? 'display:none' : ''}">
        <label>Inhalt</label>
        <textarea data-field="content" rows="3">${escapeHtml(cat.content || '')}</textarea>
      </div>
      <label>Eigener Countdown (optional, Datum/Uhrzeit)</label>
      <input type="datetime-local" data-field="countdownTo" value="${cat.countdownTo || ''}">
      <div class="cat-form-block" style="${cat.type === 'form' ? '' : 'display:none'}">
        <label>Formularfelder</label>
        <div class="fields-editor"></div>
        <button class="btn btn-secondary" data-action="add-field">+ Feld hinzufügen</button>
      </div>
      <button class="btn btn-primary" data-action="save" style="margin-top:0.75rem;">Speichern</button>
    `;

    const fieldsEditor = el.querySelector('.fields-editor');
    let localFields = JSON.parse(JSON.stringify(cat.fields || []));
    function renderFieldsEditor() {
      fieldsEditor.innerHTML = '';
      localFields.forEach((f, fi) => {
        const row = document.createElement('div');
        row.className = 'field-row';
        row.innerHTML = `
          <input type="text" placeholder="Feldname (z.B. allergien)" data-fkey value="${escapeHtml(f.key || '')}" style="width:28%">
          <input type="text" placeholder="Beschriftung" data-flabel value="${escapeHtml(f.label || '')}" style="width:28%">
          <select data-ftype style="width:22%">
            <option value="text" ${f.type === 'text' ? 'selected' : ''}>Text</option>
            <option value="textarea" ${f.type === 'textarea' ? 'selected' : ''}>Mehrzeilig</option>
            <option value="select" ${f.type === 'select' ? 'selected' : ''}>Auswahl</option>
          </select>
          <input type="text" placeholder="Optionen, mit Komma" data-foptions value="${escapeHtml((f.options || []).join(', '))}" style="width:22%; ${f.type === 'select' ? '' : 'display:none'}">
          <button class="icon-btn" data-remove-field>✕</button>
        `;
        row.querySelector('[data-fkey]').addEventListener('input', e => localFields[fi].key = e.target.value);
        row.querySelector('[data-flabel]').addEventListener('input', e => localFields[fi].label = e.target.value);
        const typeSel = row.querySelector('[data-ftype]');
        const optsInput = row.querySelector('[data-foptions]');
        typeSel.addEventListener('change', e => {
          localFields[fi].type = e.target.value;
          optsInput.style.display = e.target.value === 'select' ? '' : 'none';
        });
        optsInput.addEventListener('input', e => {
          localFields[fi].options = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
        });
        row.querySelector('[data-remove-field]').addEventListener('click', () => {
          localFields.splice(fi, 1);
          renderFieldsEditor();
        });
        fieldsEditor.appendChild(row);
      });
    }
    renderFieldsEditor();

    el.querySelector('[data-action="add-field"]').addEventListener('click', () => {
      localFields.push({ key: '', label: '', type: 'text', options: [] });
      renderFieldsEditor();
    });

    const typeSelect = el.querySelector('[data-field="type"]');
    typeSelect.addEventListener('change', () => {
      const isForm = typeSelect.value === 'form';
      el.querySelector('.cat-info-block').style.display = isForm ? 'none' : '';
      el.querySelector('.cat-form-block').style.display = isForm ? '' : 'none';
    });

    el.querySelector('[data-action="up"]').addEventListener('click', () => moveCategory(idx, -1));
    el.querySelector('[data-action="down"]').addEventListener('click', () => moveCategory(idx, 1));
    el.querySelector('[data-action="delete"]').addEventListener('click', () => deleteCategory(cat.id));
    el.querySelector('[data-action="save"]').addEventListener('click', () => {
      const updated = {
        title: el.querySelector('[data-field="title"]').value.trim(),
        icon: el.querySelector('[data-field="icon"]').value.trim(),
        type: el.querySelector('[data-field="type"]').value,
        content: el.querySelector('[data-field="content"]').value,
        countdownTo: el.querySelector('[data-field="countdownTo"]').value,
        fields: localFields.filter(f => f.key && f.label)
      };
      saveCategory(cat.id, updated);
    });

    wrap.appendChild(el);
  });
}

async function saveCategory(id, updated) {
  await updateDoc(doc(db, 'categories', id), updated);
  await loadCategoriesAdmin();
}

async function moveCategory(idx, dir) {
  const other = idx + dir;
  if (other < 0 || other >= state.categories.length) return;
  const a = state.categories[idx];
  const b = state.categories[other];
  await updateDoc(doc(db, 'categories', a.id), { order: b.order });
  await updateDoc(doc(db, 'categories', b.id), { order: a.order });
  await loadCategoriesAdmin();
}

async function deleteCategory(id) {
  if (!confirm('Diese Kategorie wirklich löschen?')) return;
  await deleteDoc(doc(db, 'categories', id));
  await loadCategoriesAdmin();
}

$('#btn-add-category').addEventListener('click', async () => {
  const maxOrder = state.categories.reduce((m, c) => Math.max(m, c.order || 0), -1);
  await addDoc(collection(db, 'categories'), {
    title: 'Neue Kategorie', icon: '', type: 'info', content: '', order: maxOrder + 1, countdownTo: ''
  });
  await loadCategoriesAdmin();
});

$('#btn-seed-categories').addEventListener('click', async () => {
  if (!confirm('Standard-Kategorien einfügen? (Bestehende bleiben erhalten)')) return;
  for (const c of DEFAULT_CATEGORIES) {
    await addDoc(collection(db, 'categories'), c);
  }
  await loadCategoriesAdmin();
});

// ---------------------------------------------------------------
// Admin: Gästeliste
// ---------------------------------------------------------------
function renderAdminGuests() {
  const wrap = $('#admin-guests-list');
  wrap.innerHTML = '<h3>Gäste</h3>';
  state.guests.sort((a, b) => a.name.localeCompare(b.name)).forEach(g => {
    const row = document.createElement('div');
    row.className = 'field-row';
    row.innerHTML = `<span style="flex:1">${escapeHtml(g.name)}</span><button class="icon-btn" data-id="${g.id}">🗑 löschen</button>`;
    row.querySelector('button').addEventListener('click', async () => {
      if (!confirm(`${g.name} wirklich löschen?`)) return;
      await deleteDoc(doc(db, 'guests', g.id));
      await loadGuests();
    });
    wrap.appendChild(row);
  });
}

$('#btn-add-guest').addEventListener('click', async () => {
  const name = $('#new-guest-name').value.trim();
  if (!name) return;
  await addDoc(collection(db, 'guests'), { name });
  $('#new-guest-name').value = '';
  await loadGuests();
});

// ---------------------------------------------------------------
// Admin: Antworten
// ---------------------------------------------------------------
async function loadAllResponses() {
  const snap = await getDocs(collection(db, 'responses'));
  state.responses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderAdminResponses();
}

function renderAdminResponses() {
  const wrap = $('#admin-responses-list');
  if (state.responses.length === 0) {
    wrap.innerHTML = '<p class="muted">Noch keine Antworten.</p>';
    return;
  }
  const catTitles = Object.fromEntries(state.categories.map(c => [c.id, c.title]));
  let html = '<table class="responses-table"><thead><tr><th>Gast</th><th>Antworten</th></tr></thead><tbody>';
  state.responses.forEach(r => {
    const answers = Object.entries(r.answers || {}).map(([catId, vals]) => {
      const title = catTitles[catId] || catId;
      const inner = Object.entries(vals).map(([k, v]) => `${k}: ${v}`).join(', ');
      return `<strong>${escapeHtml(title)}:</strong> ${escapeHtml(inner)}`;
    }).join('<br>');
    html += `<tr><td>${escapeHtml(r.guestName || r.id)}</td><td>${answers}</td></tr>`;
  });
  html += '</tbody></table>';
  wrap.innerHTML = html;
}

$('#btn-export-csv').addEventListener('click', () => {
  const catTitles = Object.fromEntries(state.categories.map(c => [c.id, c.title]));
  const rows = [['Gast', 'Kategorie', 'Feld', 'Antwort']];
  state.responses.forEach(r => {
    Object.entries(r.answers || {}).forEach(([catId, vals]) => {
      Object.entries(vals).forEach(([k, v]) => {
        rows.push([r.guestName || r.id, catTitles[catId] || catId, k, v]);
      });
    });
  });
  const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'hochzeit-antworten.csv';
  a.click();
  URL.revokeObjectURL(url);
});

// ---------------------------------------------------------------
// Init
// ---------------------------------------------------------------
(async function init() {
  await loadConfig();
  await loadGuests();
  await loadCategories();
  startCountdowns();
  if (state.currentGuest) {
    await loadResponsesForCurrentGuest();
  }
})();
