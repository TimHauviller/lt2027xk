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
const db = getFirestore(app);
const auth = getAuth(app);

// ---------------------------------------------------------------
// Bereiche: jeder Kategorie-Typ gehört automatisch zu einem Bereich,
// der dem Gast im Übersichts-Fenster (Hub) zur Auswahl angeboten wird.
// ---------------------------------------------------------------
const SECTIONS = [
  { key: 'infos', title: 'Wichtige Infos', desc: 'Alles Wichtige rund um die Hochzeit.' },
  { key: 'faq', title: 'Häufig gestellte Fragen', desc: 'Antworten auf die Fragen, die uns am häufigsten gestellt werden.' },
  { key: 'todo', title: 'Noch auszufüllen', desc: 'Eure persönlichen Angaben zu Essen, Kleidung und mehr.' }
];
const TYPE_SECTION = { info: 'infos', faq: 'faq', form: 'todo', checklist: 'todo' };

// ---------------------------------------------------------------
// Default (Beispiel-)Kategorien, die der Admin per Knopfdruck einfügen kann
// ---------------------------------------------------------------
const DEFAULT_CATEGORIES = [
  { title: "Kleidermodus", type: "info", order: 0, images: [],
    content: "Wir wünschen uns elegante Sommerkleidung. Details folgen." },
  { title: "Unterkunft", type: "info", order: 1, images: [],
    content: "Infos zu Unterkünften folgen in Kürze." },
  { title: "Anreise", type: "info", order: 2, images: [],
    content: "Anreise per Flug nach Pisa oder Florenz, oder mit dem Auto. Die genaue Adresse bekommt ihr rechtzeitig vor der Hochzeit." },
  { title: "Ablauf der Abende", type: "info", order: 3, images: [], countdownTo: "",
    content: "Den genauen Ablauf geben wir vor Ort bekannt." },
  { title: "Packliste", type: "info", order: 4, images: [],
    content: "Denkt an: Sonnenschutz, bequeme Schuhe, ein Outfit für den Abend." },
  { title: "Abreise", type: "info", order: 5, images: [],
    content: "Infos zur Abreise folgen." },
  { title: "Überweisung", type: "info", order: 6, images: [],
    content: "Betrag, IBAN und Frist folgen." },
  { title: "Ansprechpartnerinnen", type: "info", order: 7, images: [],
    content: "Bei Fragen meldet euch bei uns." },
  { title: "Hochzeitsgeschenke", type: "info", order: 8, images: [],
    content: "Über eure Anwesenheit freuen wir uns am meisten. Wer möchte, findet hier weitere Infos." },
  { title: "Häufig gestellte Fragen", type: "faq", order: 9, images: [],
    qna: [
      { question: "Dürfen wir Kinder mitbringen?", answer: "Details folgen." },
      { question: "Gibt es einen Shuttle-Service?", answer: "Details folgen." }
    ] },
  { title: "Essen & Getränke", type: "form", order: 10, images: [],
    fields: [
      { key: "ernaehrung", label: "Ernährung", type: "select", options: ["Fleisch", "Vegetarisch", "Vegan"] },
      { key: "allergien", label: "Allergien / Unverträglichkeiten", type: "textarea" },
      { key: "getraenke", label: "Wunschgetränke", type: "text" }
    ] },
  { title: "Checkliste vor der Hochzeit", type: "checklist", order: 11, images: [],
    items: [
      { key: "outfit", label: "Outfit besorgt" },
      { key: "anreise", label: "Anreise gebucht" },
      { key: "geschenk", label: "Geschenk überlegt" },
      { key: "rsvp", label: "Zusage abgegeben" }
    ] }
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
  currentSection: null,
  isAdmin: false
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function showScreen(id) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function shadeColor(hex, percent) {
  try {
    const f = parseInt(hex.slice(1), 16);
    const t = percent < 0 ? 0 : 255;
    const p = percent < 0 ? percent * -1 : percent;
    const R = f >> 16, G = (f >> 8) & 0x00FF, B = f & 0x0000FF;
    return "#" + (0x1000000 + (Math.round((t - R) * p) + R) * 0x10000 +
      (Math.round((t - G) * p) + G) * 0x100 + (Math.round((t - B) * p) + B)).toString(16).slice(1);
  } catch (e) {
    return hex;
  }
}

function applyColors(colors) {
  const root = document.documentElement;
  const c = colors || {};
  const terracotta = c.terracotta || '#ea785b';
  const sage = c.sage || '#889063';
  const cream = c.cream || '#fbf3e7';
  const grape = c.grape || '#3f0013';
  root.style.setProperty('--terracotta', terracotta);
  root.style.setProperty('--blood-orange', shadeColor(terracotta, -0.25));
  root.style.setProperty('--sage', sage);
  root.style.setProperty('--sage-dark', shadeColor(sage, -0.4));
  root.style.setProperty('--cream', cream);
  root.style.setProperty('--grape', grape);
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
      subtitle: "Wir heiraten in der Toskana, Italien",
      intro: "9. – 13. Mai 2027",
      photoUrl: "",
      stripPhoto1: "", stripPhoto2: "", stripPhoto3: "",
      weddingStart: "2027-05-09",
      weddingEnd: "2027-05-13",
      colors: {}
    };
  }
  renderConfig();
}

function renderConfig() {
  const c = state.config;
  $('#landing-title').textContent = c.title;
  $('#hub-title').textContent = c.title;
  $('#landing-subtitle').textContent = c.subtitle;
  $('#landing-intro').textContent = c.intro;
  if (c.photoUrl) {
    $('#landing-photo').style.backgroundImage = `url(${c.photoUrl})`;
  }
  $('#strip-photo-1').src = c.stripPhoto1 || 'photo1.jpg';
  $('#strip-photo-2').src = c.stripPhoto2 || 'photo2.jpg';
  $('#strip-photo-3').src = c.stripPhoto3 || 'photo3.jpg';
  $('#marquee-track').textContent = `${c.title || 'Lucie & Timmy'}  –  Toskana, Italien  –  ${c.intro || ''}`;
  applyColors(c.colors);

  // Admin-Formulare vorbefüllen
  $('#cfg-title').value = c.title || '';
  $('#cfg-subtitle').value = c.subtitle || '';
  $('#cfg-intro').value = c.intro || '';
  $('#cfg-photo').value = c.photoUrl || '';
  $('#cfg-strip1').value = c.stripPhoto1 || '';
  $('#cfg-strip2').value = c.stripPhoto2 || '';
  $('#cfg-strip3').value = c.stripPhoto3 || '';
  $('#cfg-start').value = c.weddingStart || '';
  $('#cfg-end').value = c.weddingEnd || '';

  const colors = c.colors || {};
  $('#clr-terracotta').value = colors.terracotta || '#ea785b';
  $('#clr-sage').value = colors.sage || '#889063';
  $('#clr-cream').value = colors.cream || '#fbf3e7';
  $('#clr-grape').value = colors.grape || '#3f0013';
}

async function saveConfig() {
  const newConfig = {
    ...state.config,
    title: $('#cfg-title').value.trim(),
    subtitle: $('#cfg-subtitle').value.trim(),
    intro: $('#cfg-intro').value.trim(),
    photoUrl: $('#cfg-photo').value.trim(),
    stripPhoto1: $('#cfg-strip1').value.trim(),
    stripPhoto2: $('#cfg-strip2').value.trim(),
    stripPhoto3: $('#cfg-strip3').value.trim(),
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

async function saveColors() {
  const colors = {
    terracotta: $('#clr-terracotta').value,
    sage: $('#clr-sage').value,
    cream: $('#clr-cream').value,
    grape: $('#clr-grape').value
  };
  const newConfig = { ...state.config, colors };
  await setDoc(doc(db, 'config', 'general'), newConfig);
  state.config = newConfig;
  applyColors(colors);
  $('#colors-saved-msg').classList.remove('hidden');
  setTimeout(() => $('#colors-saved-msg').classList.add('hidden'), 2000);
}

async function resetColors() {
  const newConfig = { ...state.config, colors: {} };
  await setDoc(doc(db, 'config', 'general'), newConfig);
  state.config = newConfig;
  renderConfig();
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
    $('#hub-mini-countdown').textContent = diff > 0 ? `${d} Tage bis zur Hochzeit` : `Es ist soweit!`;

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
// Kategorien laden
// ---------------------------------------------------------------
async function loadCategories() {
  const q = query(collection(db, 'categories'), orderBy('order', 'asc'));
  const snap = await getDocs(q);
  state.categories = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ---------------------------------------------------------------
// Hub (Übersicht: Wichtige Infos / FAQ / Noch auszufüllen)
// ---------------------------------------------------------------
function computeTodoProgress() {
  const todoCats = state.categories.filter(c => c.type === 'form' || c.type === 'checklist');
  let total = 0, done = 0;
  const resp = state.currentGuest ? state.responses.find(r => r.id === state.currentGuest.id) : null;
  todoCats.forEach(cat => {
    if (cat.type === 'form') {
      const fields = cat.fields || [];
      total += fields.length;
      const answers = (resp && resp.answers && resp.answers[cat.id]) || {};
      done += fields.filter(f => (answers[f.key] || '').toString().trim() !== '').length;
    } else if (cat.type === 'checklist') {
      const items = cat.items || [];
      total += items.length;
      const checked = (resp && resp.checklist && resp.checklist[cat.id]) || [];
      done += items.filter(it => checked.includes(it.key)).length;
    }
  });
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}

function renderHub() {
  const list = $('#hub-list');
  list.innerHTML = '';
  const progress = computeTodoProgress();
  SECTIONS.forEach(sec => {
    const count = state.categories.filter(c => TYPE_SECTION[c.type] === sec.key).length;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'hub-card';
    let progressHtml = '';
    if (sec.key === 'todo' && progress.total > 0) {
      progressHtml = `
        <div class="progress-wrap">
          <div class="progress-bar"><div class="progress-fill" style="width:${progress.pct}%"></div></div>
          <span class="progress-label">${progress.pct}% erledigt (${progress.done}/${progress.total})</span>
        </div>`;
    }
    card.innerHTML = `
      <h3>${escapeHtml(sec.title)}</h3>
      <p class="muted small">${escapeHtml(sec.desc)}</p>
      <p class="muted small">${count} ${count === 1 ? 'Kategorie' : 'Kategorien'}</p>
      ${progressHtml}
    `;
    card.addEventListener('click', () => openSection(sec.key));
    list.appendChild(card);
  });
}

function enterHub() {
  $('#hub-title').textContent = (state.config && state.config.title) || 'Lucie & Timmy';
  $('#hub-greeting').textContent = state.currentGuest ? `Hallo, ${state.currentGuest.name}!` : '';
  renderHub();
  showScreen('#screen-hub');
}

function openSection(sectionKey) {
  state.currentSection = sectionKey;
  const sec = SECTIONS.find(s => s.key === sectionKey);
  $('#main-title').textContent = sec.title;
  $('#main-subtitle').textContent = sec.desc;
  renderCategories();
  showScreen('#screen-main');
}

// ---------------------------------------------------------------
// Kategorien rendern (Gast-Ansicht, gefiltert nach Bereich)
// ---------------------------------------------------------------
function renderImages(images) {
  if (!images || !images.length) return null;
  const gal = document.createElement('div');
  gal.className = 'image-gallery';
  images.forEach(url => {
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    img.loading = 'lazy';
    gal.appendChild(img);
  });
  return gal;
}

function renderFaq(cat) {
  const wrap = document.createElement('div');
  const list = cat.qna || [];
  if (!list.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Noch keine Fragen hinterlegt.';
    wrap.appendChild(p);
    return wrap;
  }
  list.forEach(item => {
    const block = document.createElement('div');
    block.className = 'faq-item';
    const q = document.createElement('p');
    q.className = 'faq-question';
    q.textContent = item.question;
    const a = document.createElement('p');
    a.className = 'faq-answer';
    a.textContent = item.answer;
    block.appendChild(q);
    block.appendChild(a);
    wrap.appendChild(block);
  });
  return wrap;
}

function getGuestChecklist(catId) {
  if (!state.currentGuest) return [];
  const resp = state.responses.find(r => r.id === state.currentGuest.id);
  if (!resp) return [];
  resp.checklist = resp.checklist || {};
  resp.checklist[catId] = resp.checklist[catId] || [];
  return resp.checklist[catId];
}

async function saveGuestChecklist(categoryId, checkedIds) {
  if (!state.currentGuest) return;
  try {
    const ref = doc(db, 'responses', state.currentGuest.id);
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : { guestName: state.currentGuest.name, answers: {}, checklist: {} };
    data.checklist = data.checklist || {};
    data.checklist[categoryId] = checkedIds;
    data.guestName = state.currentGuest.name;
    data.updatedAt = new Date().toISOString();
    await setDoc(ref, data);
  } catch (err) {
    console.error('Fortschritt konnte nicht gespeichert werden:', err);
    alert('Dein Fortschritt konnte leider nicht gespeichert werden. Bitte versuch es gleich nochmal.');
  }
}

function renderChecklist(cat) {
  const wrap = document.createElement('div');
  const items = cat.items || [];
  const checkedIds = getGuestChecklist(cat.id);

  const progressWrap = document.createElement('div');
  progressWrap.className = 'progress-wrap';
  const bar = document.createElement('div');
  bar.className = 'progress-bar';
  const fill = document.createElement('div');
  fill.className = 'progress-fill';
  bar.appendChild(fill);
  const label = document.createElement('span');
  label.className = 'progress-label';
  progressWrap.appendChild(bar);
  progressWrap.appendChild(label);
  wrap.appendChild(progressWrap);

  function updateProgress() {
    const total = items.length;
    const done = items.filter(it => checkedIds.includes(it.key)).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    fill.style.width = pct + '%';
    label.textContent = `${pct}% erledigt (${done}/${total})`;
  }

  items.forEach(it => {
    const row = document.createElement('label');
    row.className = 'checklist-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = checkedIds.includes(it.key);
    cb.addEventListener('change', async () => {
      if (cb.checked) {
        if (!checkedIds.includes(it.key)) checkedIds.push(it.key);
      } else {
        const i = checkedIds.indexOf(it.key);
        if (i > -1) checkedIds.splice(i, 1);
      }
      updateProgress();
      await saveGuestChecklist(cat.id, checkedIds);
    });
    const span = document.createElement('span');
    span.textContent = it.label;
    row.appendChild(cb);
    row.appendChild(span);
    wrap.appendChild(row);
  });

  if (!items.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Noch keine Punkte hinterlegt.';
    wrap.appendChild(p);
  } else if (!state.currentGuest) {
    const hint = document.createElement('p');
    hint.className = 'saved-hint';
    hint.textContent = 'Bitte wähle zuerst deinen Namen aus, um deinen Fortschritt zu speichern.';
    wrap.appendChild(hint);
  }

  updateProgress();
  return wrap;
}

function renderFormFields(cat) {
  const wrap = document.createElement('div');
  const resp = state.currentGuest ? state.responses.find(r => r.id === state.currentGuest.id) : null;
  const existing = (resp && resp.answers && resp.answers[cat.id]) || {};

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
  try {
    const ref = doc(db, 'responses', state.currentGuest.id);
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : { guestName: state.currentGuest.name, answers: {} };
    data.answers = data.answers || {};
    data.answers[categoryId] = { ...(data.answers[categoryId] || {}), [key]: value };
    data.guestName = state.currentGuest.name;
    data.updatedAt = new Date().toISOString();
    await setDoc(ref, data);
  } catch (err) {
    console.error('Antwort konnte nicht gespeichert werden:', err);
    alert('Deine Angabe konnte leider nicht gespeichert werden. Bitte versuch es gleich nochmal.');
  }
}

function renderCategoryBody(cat, body) {
  if (cat.countdownTo) {
    const cd = document.createElement('div');
    cd.className = 'category-countdown';
    cd.dataset.target = cat.countdownTo;
    body.appendChild(cd);
  }
  if (cat.type === 'form') {
    body.appendChild(renderFormFields(cat));
  } else if (cat.type === 'checklist') {
    body.appendChild(renderChecklist(cat));
  } else if (cat.type === 'faq') {
    body.appendChild(renderFaq(cat));
  } else {
    const p = document.createElement('div');
    p.innerHTML = escapeHtml(cat.content || '').replace(/\n/g, '<br>');
    body.appendChild(p);
  }
  const gal = renderImages(cat.images);
  if (gal) body.appendChild(gal);
}

function renderCategories() {
  const list = $('#categories-list');
  list.innerHTML = '';
  const filtered = state.categories.filter(c => TYPE_SECTION[c.type] === state.currentSection);
  if (filtered.length === 0) {
    list.innerHTML = '<p class="muted">Noch keine Inhalte in diesem Bereich.</p>';
    return;
  }
  filtered.forEach(cat => {
    const el = document.createElement('div');
    el.className = 'category';
    el.innerHTML = `
      <div class="category-header">
        <span>${escapeHtml(cat.title)}</span>
        <span class="chevron"></span>
      </div>
      <div class="category-body"></div>
    `;
    el.querySelector('.category-header').addEventListener('click', () => {
      el.classList.toggle('open');
    });
    const body = el.querySelector('.category-body');
    renderCategoryBody(cat, body);
    list.appendChild(el);
  });
  startCountdowns();
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
// Event-Listener: Landing / Gast-Auswahl / Hub / Bereichs-Screen
// ---------------------------------------------------------------
$('#btn-enter').addEventListener('click', () => {
  if (state.currentGuest) {
    enterHub();
  } else {
    showScreen('#screen-guest');
  }
});

$('#btn-guest-back').addEventListener('click', () => showScreen('#screen-landing'));

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
  enterHub();
});

$('#btn-hub-switch-guest').addEventListener('click', () => {
  state.currentGuest = null;
  localStorage.removeItem('hz_guest');
  showScreen('#screen-guest');
});

$('#btn-hub-back').addEventListener('click', () => showScreen('#screen-landing'));
$('#btn-back-to-hub').addEventListener('click', () => {
  renderHub();
  showScreen('#screen-hub');
});
$('#btn-main-back-landing').addEventListener('click', () => showScreen('#screen-landing'));

async function loadResponsesForCurrentGuest() {
  if (!state.currentGuest) return;
  try {
    const ref = doc(db, 'responses', state.currentGuest.id);
    const snap = await getDoc(ref);
    state.responses = snap.exists() ? [{ id: state.currentGuest.id, ...snap.data() }] : [];
  } catch (err) {
    console.error('Antworten konnten nicht geladen werden:', err);
    state.responses = [];
  }
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
  renderHub();
  showScreen('#screen-hub');
});
$('#btn-admin-back').addEventListener('click', () => {
  renderHub();
  showScreen('#screen-hub');
});

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
$('#btn-save-colors').addEventListener('click', saveColors);
$('#btn-reset-colors').addEventListener('click', resetColors);

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
        <button type="button" class="btn-icon-text" data-action="up">Hoch</button>
        <button type="button" class="btn-icon-text" data-action="down">Runter</button>
        <strong>${escapeHtml(cat.title)}</strong>
        <button type="button" class="btn-icon-text" data-action="delete">Löschen</button>
      </div>
      <label>Titel</label>
      <input type="text" data-field="title" value="${escapeHtml(cat.title)}">
      <label>Typ</label>
      <select data-field="type">
        <option value="info" ${cat.type === 'info' ? 'selected' : ''}>Info-Text (Wichtige Infos)</option>
        <option value="faq" ${cat.type === 'faq' ? 'selected' : ''}>Frage &amp; Antwort (FAQ)</option>
        <option value="form" ${cat.type === 'form' ? 'selected' : ''}>Formular für Gäste (Auszufüllen)</option>
        <option value="checklist" ${cat.type === 'checklist' ? 'selected' : ''}>Checkliste mit Fortschritt (Auszufüllen)</option>
      </select>

      <div class="cat-block cat-block-info">
        <label>Inhalt</label>
        <textarea data-field="content" rows="3">${escapeHtml(cat.content || '')}</textarea>
      </div>

      <div class="cat-block cat-block-faq">
        <label>Fragen und Antworten</label>
        <div class="qna-editor"></div>
        <button type="button" class="btn btn-secondary" data-action="add-qna">Frage hinzufügen</button>
      </div>

      <div class="cat-block cat-block-form">
        <label>Formularfelder</label>
        <div class="fields-editor"></div>
        <button type="button" class="btn btn-secondary" data-action="add-field">Feld hinzufügen</button>
      </div>

      <div class="cat-block cat-block-checklist">
        <label>Checklisten-Punkte</label>
        <div class="items-editor"></div>
        <button type="button" class="btn btn-secondary" data-action="add-item">Punkt hinzufügen</button>
      </div>

      <label>Eigener Countdown (optional, Datum und Uhrzeit)</label>
      <input type="datetime-local" data-field="countdownTo" value="${cat.countdownTo || ''}">

      <label>Bilder (eine Bild-URL pro Zeile, optional)</label>
      <textarea data-field="images" rows="2" placeholder="https://...">${escapeHtml((cat.images || []).join('\n'))}</textarea>

      <button class="btn btn-primary" data-action="save" style="margin-top:0.75rem;">Speichern</button>
    `;

    function updateBlocks(type) {
      el.querySelector('.cat-block-info').style.display = type === 'info' ? '' : 'none';
      el.querySelector('.cat-block-faq').style.display = type === 'faq' ? '' : 'none';
      el.querySelector('.cat-block-form').style.display = type === 'form' ? '' : 'none';
      el.querySelector('.cat-block-checklist').style.display = type === 'checklist' ? '' : 'none';
    }
    updateBlocks(cat.type);

    let localFields = JSON.parse(JSON.stringify(cat.fields || []));
    let localQna = JSON.parse(JSON.stringify(cat.qna || []));
    let localItems = JSON.parse(JSON.stringify(cat.items || []));

    const fieldsEditor = el.querySelector('.fields-editor');
    function renderFieldsEditor() {
      fieldsEditor.innerHTML = '';
      localFields.forEach((f, fi) => {
        const row = document.createElement('div');
        row.className = 'field-row';
        row.innerHTML = `
          <input type="text" placeholder="Feldname (z.B. allergien)" data-fkey value="${escapeHtml(f.key || '')}" style="width:26%">
          <input type="text" placeholder="Beschriftung" data-flabel value="${escapeHtml(f.label || '')}" style="width:26%">
          <select data-ftype style="width:20%">
            <option value="text" ${f.type === 'text' ? 'selected' : ''}>Text</option>
            <option value="textarea" ${f.type === 'textarea' ? 'selected' : ''}>Mehrzeilig</option>
            <option value="select" ${f.type === 'select' ? 'selected' : ''}>Auswahl</option>
          </select>
          <input type="text" placeholder="Optionen, mit Komma" data-foptions value="${escapeHtml((f.options || []).join(', '))}" style="width:20%; ${f.type === 'select' ? '' : 'display:none'}">
          <button type="button" class="btn-icon-text" data-remove-field>Entfernen</button>
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

    const qnaEditor = el.querySelector('.qna-editor');
    function renderQnaEditor() {
      qnaEditor.innerHTML = '';
      localQna.forEach((qa, qi) => {
        const row = document.createElement('div');
        row.className = 'qna-row';
        row.innerHTML = `
          <input type="text" placeholder="Frage" data-qq value="${escapeHtml(qa.question || '')}">
          <textarea placeholder="Antwort" rows="2" data-qa>${escapeHtml(qa.answer || '')}</textarea>
          <button type="button" class="btn-icon-text" data-remove-qna>Entfernen</button>
        `;
        row.querySelector('[data-qq]').addEventListener('input', e => localQna[qi].question = e.target.value);
        row.querySelector('[data-qa]').addEventListener('input', e => localQna[qi].answer = e.target.value);
        row.querySelector('[data-remove-qna]').addEventListener('click', () => {
          localQna.splice(qi, 1);
          renderQnaEditor();
        });
        qnaEditor.appendChild(row);
      });
    }
    renderQnaEditor();

    const itemsEditor = el.querySelector('.items-editor');
    function renderItemsEditor() {
      itemsEditor.innerHTML = '';
      localItems.forEach((it, ii) => {
        const row = document.createElement('div');
        row.className = 'field-row';
        row.innerHTML = `
          <input type="text" placeholder="Text des Punktes" data-ilabel value="${escapeHtml(it.label || '')}" style="flex:1">
          <button type="button" class="btn-icon-text" data-remove-item>Entfernen</button>
        `;
        row.querySelector('[data-ilabel]').addEventListener('input', e => localItems[ii].label = e.target.value);
        row.querySelector('[data-remove-item]').addEventListener('click', () => {
          localItems.splice(ii, 1);
          renderItemsEditor();
        });
        itemsEditor.appendChild(row);
      });
    }
    renderItemsEditor();

    el.querySelector('[data-action="add-field"]').addEventListener('click', () => {
      localFields.push({ key: '', label: '', type: 'text', options: [] });
      renderFieldsEditor();
    });
    el.querySelector('[data-action="add-qna"]').addEventListener('click', () => {
      localQna.push({ question: '', answer: '' });
      renderQnaEditor();
    });
    el.querySelector('[data-action="add-item"]').addEventListener('click', () => {
      localItems.push({ key: 'item_' + Math.random().toString(36).slice(2, 8), label: '' });
      renderItemsEditor();
    });

    const typeSelect = el.querySelector('[data-field="type"]');
    typeSelect.addEventListener('change', () => updateBlocks(typeSelect.value));

    el.querySelector('[data-action="up"]').addEventListener('click', () => moveCategory(idx, -1));
    el.querySelector('[data-action="down"]').addEventListener('click', () => moveCategory(idx, 1));
    el.querySelector('[data-action="delete"]').addEventListener('click', () => deleteCategory(cat.id));
    el.querySelector('[data-action="save"]').addEventListener('click', () => {
      const type = typeSelect.value;
      const updated = {
        title: el.querySelector('[data-field="title"]').value.trim(),
        type,
        order: cat.order || 0,
        countdownTo: el.querySelector('[data-field="countdownTo"]').value,
        images: el.querySelector('[data-field="images"]').value.split('\n').map(s => s.trim()).filter(Boolean)
      };
      if (type === 'info') {
        updated.content = el.querySelector('[data-field="content"]').value;
      } else if (type === 'faq') {
        updated.qna = localQna.filter(q => (q.question || '').trim() && (q.answer || '').trim());
      } else if (type === 'form') {
        updated.fields = localFields.filter(f => f.key && f.label);
      } else if (type === 'checklist') {
        updated.items = localItems.filter(it => it.label && it.label.trim());
      }
      saveCategory(cat.id, updated);
    });

    wrap.appendChild(el);
  });
}

async function saveCategory(id, updated) {
  await setDoc(doc(db, 'categories', id), updated);
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
    title: 'Neue Kategorie', type: 'info', content: '', images: [], order: maxOrder + 1, countdownTo: ''
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
    row.innerHTML = `<span style="flex:1">${escapeHtml(g.name)}</span><button type="button" class="btn-icon-text" data-id="${g.id}">Löschen</button>`;
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
  let html = '<table class="responses-table"><thead><tr><th>Gast</th><th>Formular-Angaben</th><th>Checklisten-Fortschritt</th></tr></thead><tbody>';
  state.responses.forEach(r => {
    const answers = Object.entries(r.answers || {}).map(([catId, vals]) => {
      const title = catTitles[catId] || catId;
      const inner = Object.entries(vals).map(([k, v]) => `${k}: ${v}`).join(', ');
      return `<strong>${escapeHtml(title)}:</strong> ${escapeHtml(inner)}`;
    }).join('<br>') || '<span class="muted">–</span>';

    const checklistHtml = Object.entries(r.checklist || {}).map(([catId, checked]) => {
      const cat = state.categories.find(c => c.id === catId);
      const total = (cat && cat.items && cat.items.length) || 0;
      const title = catTitles[catId] || catId;
      return `<strong>${escapeHtml(title)}:</strong> ${checked.length}/${total}`;
    }).join('<br>') || '<span class="muted">–</span>';

    html += `<tr><td>${escapeHtml(r.guestName || r.id)}</td><td>${answers}</td><td>${checklistHtml}</td></tr>`;
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
    Object.entries(r.checklist || {}).forEach(([catId, checked]) => {
      const cat = state.categories.find(c => c.id === catId);
      const total = (cat && cat.items && cat.items.length) || 0;
      rows.push([r.guestName || r.id, catTitles[catId] || catId, 'Fortschritt', `${checked.length}/${total}`]);
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
