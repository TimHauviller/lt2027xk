import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc,
  collection, getDocs, onSnapshot, query, orderBy, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ---------------------------------------------------------------
// Foto-Uploads laufen über Cloudinary (kostenloser Tarif, kein Firebase
// Storage / kein Blaze-Upgrade nötig). "Cloud name" und "Upload preset"
// kommen aus dem kostenlosen Cloudinary-Account (Dashboard -> Settings ->
// Upload -> Upload presets -> Unsigned). Bis diese Werte eingetragen sind,
// zeigt die Foto-Galerie einen Hinweis statt eines Fehlers an.
// ---------------------------------------------------------------
const CLOUDINARY_CLOUD_NAME = 'g0obb6vj';
const CLOUDINARY_UPLOAD_PRESET = 'hochzeit_gaeste_upload';

// ---------------------------------------------------------------
// Bereiche: die Ansichten, zwischen denen Gäste im Übersichts-Fenster
// (Hub) wählen können. Werden komplett in Firestore verwaltet (Admin-Tab
// "Bereiche"), damit sie frei hinzugefügt, umbenannt oder entfernt werden
// können. Jede Kategorie wird über cat.sectionId einem Bereich zugeordnet.
// ---------------------------------------------------------------
const DEFAULT_SECTIONS = [
  { title: 'Wichtige Infos', desc: 'Alles Wichtige rund um die Hochzeit, inklusive häufig gestellter Fragen.', order: 0 },
  { title: 'Noch auszufüllen', desc: 'Eure persönlichen Angaben zu Essen, Kleidung und mehr.', order: 1 },
  { title: 'Tagesplan', desc: 'Der Ablauf der einzelnen Tage.', order: 2 }
];
// Nur für die einmalige Migration alter Kategorien ohne sectionId: ordnet
// den bisherigen Kategorie-Typ dem passenden Standard-Bereich zu.
const LEGACY_TYPE_SECTION_TITLE = {
  info: 'Wichtige Infos', faq: 'Wichtige Infos',
  form: 'Noch auszufüllen', checklist: 'Noch auszufüllen',
  day: 'Tagesplan'
};

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
      { key: "ernaehrung", label: "Ernährung", type: "select", options: ["Fleisch", "Vegetarisch"] },
      { key: "allergien", label: "Allergien / Unverträglichkeiten", type: "textarea" },
      { key: "getraenke", label: "Wunschgetränke", type: "text" }
    ] },
  { title: "Checkliste vor der Hochzeit", type: "checklist", order: 11, images: [],
    items: [
      { key: "outfit", label: "Outfit besorgt" },
      { key: "anreise", label: "Anreise gebucht" },
      { key: "geschenk", label: "Geschenk überlegt" },
      { key: "rsvp", label: "Zusage abgegeben" }
    ] },
  { title: "Tag 1", type: "day", order: 12, images: [],
    content: "Anreise der Gäste. Details zum Ablauf folgen." },
  { title: "Tag 2", type: "day", order: 13, images: [],
    content: "Trauung und Feier. Details zum Ablauf folgen." },
  { title: "Fotos von der Hochzeit", type: "gallery", order: 14, images: [] }
];

// ---------------------------------------------------------------
// State
// ---------------------------------------------------------------
let state = {
  config: null,
  sections: [],
  categories: [],
  guests: [],
  responses: [],
  currentGuest: JSON.parse(localStorage.getItem('hz_guest') || 'null'),
  currentSection: null,
  isAdmin: false,
  // Erlaubt, die Bearbeiten-Werkzeuge auf den Gast-Seiten kurzzeitig
  // auszublenden ("Admin: Aus"), ohne sich komplett auszuloggen - z.B. um
  // die Seite so zu sehen, wie ein Gast sie sieht.
  adminModeOn: true
};

// Sind wir eingeloggt UND ist der Admin-Modus gerade eingeschaltet?
function isAdminActive() {
  return state.isAdmin && state.adminModeOn;
}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function showScreen(id) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

// Vertauscht zwei benachbarte Einträge in einem lokalen Array (z.B. beim
// Verschieben von Formularfeldern, Fragen, Checklisten-Punkten,
// Zuteilungen oder Auswahlmöglichkeiten innerhalb eines Editors).
function moveInArray(arr, idx, dir) {
  const other = idx + dir;
  if (other < 0 || other >= arr.length) return false;
  const tmp = arr[idx];
  arr[idx] = arr[other];
  arr[other] = tmp;
  return true;
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
  try {
    await setDoc(doc(db, 'config', 'general'), newConfig);
  } catch (err) {
    console.error('Startseite konnte nicht gespeichert werden:', err);
    alert('Speichern hat leider nicht geklappt. Bitte Internetverbindung prüfen und nochmal versuchen.');
    return;
  }
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
  try {
    await setDoc(doc(db, 'config', 'general'), newConfig);
  } catch (err) {
    console.error('Farben konnten nicht gespeichert werden:', err);
    alert('Speichern hat leider nicht geklappt. Bitte Internetverbindung prüfen und nochmal versuchen.');
    return;
  }
  state.config = newConfig;
  applyColors(colors);
  $('#colors-saved-msg').classList.remove('hidden');
  setTimeout(() => $('#colors-saved-msg').classList.add('hidden'), 2000);
}

async function resetColors() {
  const newConfig = { ...state.config, colors: {} };
  try {
    await setDoc(doc(db, 'config', 'general'), newConfig);
  } catch (err) {
    console.error('Farben konnten nicht zurückgesetzt werden:', err);
    alert('Zurücksetzen hat leider nicht geklappt. Bitte nochmal versuchen.');
    return;
  }
  state.config = newConfig;
  renderConfig();
}

// ---------------------------------------------------------------
// Speichern-Feedback: zeigt direkt am Button an, ob ein Speichervorgang
// geklappt hat - damit ein Klick auf "Speichern" nie einfach wirkungslos
// verpufft. Bei Erfolg blinkt der Button kurz grün/bestätigend auf, bei
// einem Fehler wird das klar angezeigt (Button + Alert) und der Nutzer
// wird gebeten, es nochmal zu versuchen.
// ---------------------------------------------------------------
function flashButton(btn, ok, failMessage) {
  if (!btn) {
    if (!ok) alert(failMessage || 'Speichern hat leider nicht geklappt. Bitte nochmal versuchen.');
    return;
  }
  const original = btn.dataset.origLabel || btn.textContent;
  btn.dataset.origLabel = original;
  btn.textContent = ok ? 'Gespeichert!' : 'Fehler – nochmal versuchen';
  btn.classList.toggle('btn-save-fail', !ok);
  clearTimeout(btn.__flashTimer);
  btn.__flashTimer = setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove('btn-save-fail');
  }, ok ? 1800 : 3000);
  if (!ok) alert(failMessage || 'Speichern hat leider nicht geklappt. Bitte Internetverbindung prüfen und nochmal versuchen.');
}

async function withSaveFeedback(btn, action, failMessage) {
  if (btn) btn.disabled = true;
  try {
    await action();
    flashButton(btn, true);
    return true;
  } catch (err) {
    console.error('Speichern fehlgeschlagen:', err);
    flashButton(btn, false, failMessage);
    return false;
  } finally {
    if (btn) btn.disabled = false;
  }
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
// Bereiche laden
// ---------------------------------------------------------------
async function loadSections() {
  try {
    const q = query(collection(db, 'sections'), orderBy('order', 'asc'));
    const snap = await getDocs(q);
    state.sections = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('Bereiche konnten nicht geladen werden:', err);
    state.sections = [];
  }
  if (state.sections.length === 0) {
    // Fallback für die Gast-Ansicht, falls noch nie ein Admin die
    // Standard-Bereiche angelegt hat (rein zur Anzeige, nicht gespeichert).
    state.sections = DEFAULT_SECTIONS.map((s, i) => ({ id: `default-${i}`, ...s }));
  }
}

// ---------------------------------------------------------------
// Kategorien laden (inkl. einmaliger Migration alter Kategorien
// ohne sectionId auf Basis ihres bisherigen Typs)
// ---------------------------------------------------------------
async function fetchCategories() {
  const q = query(collection(db, 'categories'), orderBy('order', 'asc'));
  const snap = await getDocs(q);
  state.categories = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  await migrateLegacyCategorySections();
}

async function migrateLegacyCategorySections() {
  const bySectionTitle = {};
  state.sections.forEach(s => { bySectionTitle[s.title] = s.id; });
  for (const cat of state.categories) {
    if (!cat.sectionId) {
      const wantedTitle = LEGACY_TYPE_SECTION_TITLE[cat.type];
      const sectionId = wantedTitle && bySectionTitle[wantedTitle];
      if (sectionId) {
        cat.sectionId = sectionId;
        try {
          await updateDoc(doc(db, 'categories', cat.id), { sectionId });
        } catch (err) {
          // Gäste dürfen Kategorien nicht schreiben - dann bleibt es bei der
          // In-Memory-Zuordnung für diese Sitzung, bis ein Admin vorbeischaut.
        }
      }
    }
  }
}

async function loadCategories() {
  await fetchCategories();
}

// ---------------------------------------------------------------
// Hub (Übersicht über alle Bereiche)
// ---------------------------------------------------------------
function computeSectionProgress(fillableCats) {
  let total = 0, done = 0;
  const resp = state.currentGuest ? state.responses.find(r => r.id === state.currentGuest.id) : null;
  fillableCats.forEach(cat => {
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
  if (!state.sections.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Noch keine Bereiche angelegt.';
    list.appendChild(p);
    if (!isAdminActive()) return;
  }
  state.sections.forEach((sec, idx) => {
    const catsInSection = state.categories.filter(c => c.sectionId === sec.id);
    const fillableCats = catsInSection.filter(c => c.type === 'form' || c.type === 'checklist');

    const cardWrap = document.createElement('div');
    cardWrap.className = 'hub-card' + (fillableCats.length ? ' hub-card--todo' : '');

    const mainBtn = document.createElement('button');
    mainBtn.type = 'button';
    mainBtn.className = 'hub-card-main';
    let progressHtml = '';
    if (fillableCats.length) {
      const progress = computeSectionProgress(fillableCats);
      progressHtml = `
        <div class="progress-wrap">
          <div class="progress-bar"><div class="progress-fill" style="width:${progress.pct}%"></div></div>
          <span class="progress-label">${progress.pct}% erledigt (${progress.done}/${progress.total})</span>
        </div>`;
    }
    mainBtn.innerHTML = `
      <h3>${escapeHtml(sec.title)}</h3>
      <p class="muted small">${escapeHtml(sec.desc || '')}</p>
      ${progressHtml}
    `;
    mainBtn.addEventListener('click', () => openSection(sec.id));
    cardWrap.appendChild(mainBtn);

    // Im Admin-Modus kann der Bereich direkt hier auf der Übersicht
    // bearbeitet und in seiner Reihenfolge verschoben werden, ohne extra
    // in einen separaten Admin-Bereich wechseln zu müssen.
    if (isAdminActive()) {
      const actionsRow = document.createElement('div');
      actionsRow.className = 'hub-card-actions';
      if (idx > 0) {
        const upBtn = document.createElement('button');
        upBtn.type = 'button'; upBtn.className = 'btn-icon-text'; upBtn.textContent = 'Hoch';
        upBtn.addEventListener('click', async () => { await moveSection(idx, -1); renderHub(); });
        actionsRow.appendChild(upBtn);
      }
      if (idx < state.sections.length - 1) {
        const downBtn = document.createElement('button');
        downBtn.type = 'button'; downBtn.className = 'btn-icon-text'; downBtn.textContent = 'Runter';
        downBtn.addEventListener('click', async () => { await moveSection(idx, 1); renderHub(); });
        actionsRow.appendChild(downBtn);
      }
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn-icon-text hub-card-edit-btn';
      editBtn.textContent = 'Bearbeiten';
      actionsRow.appendChild(editBtn);
      cardWrap.appendChild(actionsRow);

      const editorWrap = document.createElement('div');
      editorWrap.className = 'hub-card-editor';

      function openEditor() {
        editorWrap.classList.add('open');
        editorWrap.innerHTML = '';
        editBtn.textContent = 'Fertig';
        const editor = buildSectionEditor(sec, {
          inline: true,
          onCancel: () => closeEditor(),
          onSaved: async () => { await loadSections(); renderHub(); },
          onDeleted: async () => { await loadSections(); renderHub(); }
        });
        editorWrap.appendChild(editor);
      }
      function closeEditor() {
        editorWrap.classList.remove('open');
        editorWrap.innerHTML = '';
        editBtn.textContent = 'Bearbeiten';
      }
      editBtn.addEventListener('click', () => {
        if (editorWrap.classList.contains('open')) closeEditor();
        else openEditor();
      });

      cardWrap.appendChild(editorWrap);
    }

    list.appendChild(cardWrap);
  });

  if (isAdminActive()) {
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn btn-secondary hub-add-section-btn';
    addBtn.textContent = '+ Neuer Bereich';
    addBtn.addEventListener('click', async () => {
      addBtn.disabled = true;
      try {
        const maxOrder = state.sections.reduce((m, s) => Math.max(m, s.order || 0), -1);
        await addDoc(collection(db, 'sections'), { title: 'Neuer Bereich', desc: '', order: maxOrder + 1 });
        await loadSections();
        renderHub();
      } catch (err) {
        console.error('Bereich konnte nicht angelegt werden:', err);
        alert('Bereich anlegen hat leider nicht geklappt. Bitte nochmal versuchen.');
      } finally {
        addBtn.disabled = false;
      }
    });
    list.appendChild(addBtn);

    const dashLink = document.createElement('button');
    dashLink.type = 'button';
    dashLink.className = 'btn-icon-text hub-admin-dashboard-link';
    dashLink.textContent = 'Verwaltung öffnen (Startseite, Design, Gäste, Antworten)';
    dashLink.addEventListener('click', async () => {
      try { await loadAdminData(); } catch (err) { console.error(err); }
      showScreen('#screen-admin');
    });
    list.appendChild(dashLink);
  }
}

function enterHub() {
  $('#hub-title').textContent = (state.config && state.config.title) || 'Lucie & Timmy';
  $('#hub-greeting').textContent = state.currentGuest ? `Hallo, ${state.currentGuest.name}!` : '';
  renderHub();
  updateAdminButtonVisibility();
  showScreen('#screen-hub');
}

// ---------------------------------------------------------------
// Admin-Zugang nur für die Personen sichtbar, die ihn brauchen.
// Wer bereits eingeloggt ist, sieht den Button immer (damit man
// jederzeit zurück in den Admin-Bereich kommt).
// ---------------------------------------------------------------
const ADMIN_VISIBLE_FOR = ['tim hauviller'];
function updateAdminButtonVisibility() {
  const name = ((state.currentGuest && state.currentGuest.name) || '').trim().toLowerCase();
  const allowed = ADMIN_VISIBLE_FOR.some(n => name === n || name.includes(n));
  const btn = $('#btn-open-admin');
  if (state.isAdmin) {
    btn.classList.remove('hidden');
    btn.textContent = state.adminModeOn ? 'Admin: An' : 'Admin: Aus';
  } else if (allowed) {
    btn.classList.remove('hidden');
    btn.textContent = 'Admin';
  } else {
    btn.classList.add('hidden');
  }
}

function openSection(sectionId) {
  state.currentSection = sectionId;
  const sec = state.sections.find(s => s.id === sectionId);
  $('#main-title').textContent = sec ? sec.title : '';
  $('#main-subtitle').textContent = sec ? (sec.desc || '') : '';
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

function renderAssignments(cat) {
  const wrap = document.createElement('div');
  const list = cat.assignments || [];

  // Jede/r Gast sieht hier nur die eigene(n) Zuteilung(en), nicht die
  // Liste aller Gäste - Admins können weiterhin über "Bearbeiten" alle
  // Zuteilungen einsehen und verwalten.
  if (!state.currentGuest) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Bitte wähle zuerst deinen Namen aus, um deinen Teil zu sehen.';
    wrap.appendChild(p);
    return wrap;
  }

  const guestName = state.currentGuest.name.trim().toLowerCase();
  const visible = list.filter(item => (item.name || '').trim().toLowerCase() === guestName);

  if (!visible.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Für dich ist aktuell nichts eingetragen.';
    wrap.appendChild(p);
    return wrap;
  }
  visible.forEach(item => {
    const block = document.createElement('div');
    block.className = 'assignment-item';
    const name = document.createElement('p');
    name.className = 'assignment-name';
    name.textContent = item.name;
    const text = document.createElement('p');
    text.className = 'assignment-text';
    text.textContent = item.text;
    block.appendChild(name);
    block.appendChild(text);
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
    // Gleicher Grund wie bei saveGuestAnswer: gezielt per Punkt-Pfad
    // schreiben statt lesen+komplett-neu-schreiben, damit schnell
    // hintereinander angeklickte Haken sich nicht gegenseitig überschreiben.
    const updatePayload = {
      [`checklist.${categoryId}`]: checkedIds,
      guestName: state.currentGuest.name,
      updatedAt: new Date().toISOString()
    };
    try {
      await updateDoc(ref, updatePayload);
    } catch (updateErr) {
      await setDoc(ref, {
        guestName: state.currentGuest.name,
        checklist: { [categoryId]: checkedIds },
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }
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

    // Mehrfachauswahl: Gäste können hier beliebig viele Optionen anklicken
    // (z.B. mehrere Lieblingsgetränke), statt nur eine einzige auszuwählen.
    if (f.type === 'multiselect') {
      const existingArr = Array.isArray(existing[f.key]) ? existing[f.key] : [];
      const optsWrap = document.createElement('div');
      optsWrap.className = 'multiselect-group';
      (f.options || []).forEach(opt => {
        const optRow = document.createElement('label');
        optRow.className = 'multiselect-option';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = opt;
        cb.checked = existingArr.includes(opt);
        cb.addEventListener('change', () => {
          const checked = Array.from(optsWrap.querySelectorAll('input[type=checkbox]:checked')).map(c => c.value);
          saveGuestAnswer(cat.id, f.key, checked);
        });
        const span = document.createElement('span');
        span.textContent = opt;
        optRow.appendChild(cb);
        optRow.appendChild(span);
        optsWrap.appendChild(optRow);
      });
      if (!(f.options || []).length) {
        const hint = document.createElement('p');
        hint.className = 'muted small';
        hint.textContent = 'Noch keine Auswahlmöglichkeiten hinterlegt.';
        optsWrap.appendChild(hint);
      }
      group.appendChild(optsWrap);
      wrap.appendChild(group);
      return;
    }

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
    // Wichtig: gezielt nur dieses eine Feld per Punkt-Pfad aktualisieren,
    // statt das ganze Dokument zu lesen und komplett neu zu schreiben. Beim
    // "Lesen, ändern, komplett neu schreiben"-Muster gingen Antworten
    // verloren, wenn z.B. bei einer Mehrfachauswahl mehrere Haken kurz
    // hintereinander gesetzt wurden (jeder Klick löste einen eigenen
    // Speichervorgang aus, und der zuletzt fertige überschrieb dabei die
    // Änderungen der anderen, noch laufenden Speichervorgänge).
    const updatePayload = {
      [`answers.${categoryId}.${key}`]: value,
      guestName: state.currentGuest.name,
      updatedAt: new Date().toISOString()
    };
    try {
      await updateDoc(ref, updatePayload);
    } catch (updateErr) {
      // Dokument existiert für diesen Gast noch nicht - einmalig anlegen.
      await setDoc(ref, {
        guestName: state.currentGuest.name,
        answers: { [categoryId]: { [key]: value } },
        updatedAt: new Date().toISOString()
      }, { merge: true });
    }
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
  } else if (cat.type === 'gallery') {
    body.appendChild(renderGalleryUpload(cat));
  } else if (cat.type === 'assignment') {
    body.appendChild(renderAssignments(cat));
  } else {
    const p = document.createElement('div');
    p.innerHTML = escapeHtml(cat.content || '').replace(/\n/g, '<br>');
    body.appendChild(p);
  }
  const gal = renderImages(cat.images);
  if (gal) body.appendChild(gal);
}

// ---------------------------------------------------------------
// Foto-Galerie: Gäste können eigene Fotos hochladen (Cloudinary, kostenlos).
// Setzt voraus, dass CLOUDINARY_CLOUD_NAME und CLOUDINARY_UPLOAD_PRESET
// oben im File eingetragen sind (siehe Kommentar dort).
// ---------------------------------------------------------------
function renderGalleryUpload(cat) {
  const wrap = document.createElement('div');

  if (CLOUDINARY_CLOUD_NAME === 'DEIN_CLOUD_NAME') {
    const hint = document.createElement('p');
    hint.className = 'muted small';
    hint.textContent = 'Foto-Upload ist noch nicht eingerichtet (Cloudinary-Zugangsdaten fehlen).';
    wrap.appendChild(hint);
  }

  const uploadWrap = document.createElement('div');
  uploadWrap.className = 'gallery-upload';
  const inputId = `gallery-input-${cat.id}`;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.id = inputId;
  input.className = 'hidden';
  const label = document.createElement('label');
  label.setAttribute('for', inputId);
  label.className = 'btn btn-primary';
  label.textContent = 'Fotos hochladen';
  const status = document.createElement('p');
  status.className = 'muted small gallery-status';
  uploadWrap.appendChild(input);
  uploadWrap.appendChild(label);
  uploadWrap.appendChild(status);
  wrap.appendChild(uploadWrap);

  const grid = document.createElement('div');
  grid.className = 'image-gallery gallery-uploads';
  wrap.appendChild(grid);

  input.addEventListener('change', async () => {
    const files = Array.from(input.files || []);
    if (!files.length) return;
    status.textContent = `Lade ${files.length} Foto(s) hoch, bitte warten ...`;
    try {
      for (const file of files) {
        await uploadGalleryPhoto(cat.id, file);
      }
      status.textContent = 'Fertig, danke fürs Teilen!';
    } catch (err) {
      console.error('Foto-Upload fehlgeschlagen:', err);
      status.textContent = 'Upload leider fehlgeschlagen. Bitte nochmal versuchen.';
    }
    input.value = '';
    await loadAndRenderGalleryPhotos(cat.id, grid);
  });

  loadAndRenderGalleryPhotos(cat.id, grid);
  return wrap;
}

async function uploadGalleryPhoto(categoryId, file) {
  if (CLOUDINARY_CLOUD_NAME === 'DEIN_CLOUD_NAME') {
    throw new Error('Cloudinary ist noch nicht eingerichtet.');
  }
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('folder', `hochzeit/${categoryId}`);
  const resp = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: formData
  });
  if (!resp.ok) {
    throw new Error(`Cloudinary-Upload fehlgeschlagen (${resp.status})`);
  }
  const data = await resp.json();
  await addDoc(collection(db, 'photos'), {
    categoryId,
    url: data.secure_url,
    path: `${Date.now()}_${file.name}`,
    guestName: (state.currentGuest && state.currentGuest.name) || 'Unbekannt',
    uploadedAt: new Date().toISOString()
  });
}

async function downloadPhoto(url, filename) {
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename || 'foto.jpg';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  } catch (err) {
    console.error('Download fehlgeschlagen:', err);
    window.open(url, '_blank');
  }
}

async function loadAndRenderGalleryPhotos(categoryId, grid) {
  grid.innerHTML = '<p class="muted small">Fotos werden geladen ...</p>';
  try {
    const q = query(collection(db, 'photos'), where('categoryId', '==', categoryId), orderBy('uploadedAt', 'desc'));
    const snap = await getDocs(q);
    grid.innerHTML = '';
    if (snap.empty) {
      grid.innerHTML = '<p class="muted small">Noch keine Fotos hochgeladen. Sei die/der Erste!</p>';
      return;
    }
    snap.docs.forEach(d => {
      const data = d.data();
      const filename = (data.path || 'foto.jpg').split('/').pop();
      const item = document.createElement('div');
      item.className = 'gallery-item';
      const img = document.createElement('img');
      img.src = data.url;
      img.alt = '';
      img.loading = 'lazy';
      const actions = document.createElement('div');
      actions.className = 'gallery-item-actions';
      const dl = document.createElement('button');
      dl.type = 'button';
      dl.className = 'gallery-download-btn';
      dl.textContent = 'Herunterladen';
      dl.addEventListener('click', () => downloadPhoto(data.url, filename));
      actions.appendChild(dl);
      // Nur im Admin-Modus: ein Foto kann direkt aus der Galerie entfernt
      // werden (löscht nur den Eintrag, nicht zwingend die Originaldatei
      // beim Hosting-Anbieter - das Foto wird aber nirgends mehr angezeigt).
      if (isAdminActive()) {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'gallery-download-btn gallery-delete-btn';
        del.textContent = 'Löschen';
        del.addEventListener('click', async () => {
          if (!confirm('Dieses Foto wirklich aus der Galerie löschen?')) return;
          del.disabled = true;
          try {
            await deleteDoc(doc(db, 'photos', d.id));
            await loadAndRenderGalleryPhotos(categoryId, grid);
          } catch (err) {
            console.error('Foto konnte nicht gelöscht werden:', err);
            alert('Löschen hat leider nicht geklappt. Bitte nochmal versuchen.');
            del.disabled = false;
          }
        });
        actions.appendChild(del);
      }
      item.appendChild(img);
      item.appendChild(actions);
      grid.appendChild(item);
    });
  } catch (err) {
    console.error('Fotos konnten nicht geladen werden:', err);
    grid.innerHTML = '<p class="muted small">Fotos konnten nicht geladen werden. Bitte später nochmal versuchen.</p>';
  }
}

// Verschiebt eine Kategorie nur innerhalb ihres eigenen Bereichs nach oben
// oder unten (nicht global über alle Bereiche hinweg) - wichtig, damit das
// Verschieben direkt auf der Bereichs-Seite die richtigen Nachbarn trifft.
async function moveCategoryInSection(sectionCats, idx, dir) {
  const other = idx + dir;
  if (other < 0 || other >= sectionCats.length) return;
  const a = sectionCats[idx];
  const b = sectionCats[other];
  try {
    await updateDoc(doc(db, 'categories', a.id), { order: b.order });
    await updateDoc(doc(db, 'categories', b.id), { order: a.order });
    await loadCategories();
    renderCategories();
  } catch (err) {
    console.error('Verschieben fehlgeschlagen:', err);
    alert('Verschieben hat leider nicht geklappt. Bitte nochmal versuchen.');
  }
}

function renderCategories() {
  const list = $('#categories-list');
  list.innerHTML = '';
  const filtered = state.categories.filter(c => c.sectionId === state.currentSection);
  if (filtered.length === 0) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Noch keine Inhalte in diesem Bereich.';
    list.appendChild(p);
    if (!isAdminActive()) return;
  }
  filtered.forEach((cat, idx) => {
    // Die Foto-Galerie muss nicht erst aufgeklappt werden - Gäste sollen den
    // Upload-Knopf und bereits hochgeladene Fotos sofort sehen.
    const isFlat = cat.type === 'gallery';
    const el = document.createElement('div');
    el.className = 'category' + (isFlat ? ' category--flat open' : '');
    el.innerHTML = `
      <div class="category-header">
        <span>${escapeHtml(cat.title)}</span>
        <span class="category-header-actions"></span>
        <span class="chevron"></span>
      </div>
      <div class="category-body"></div>
    `;
    const headerEl = el.querySelector('.category-header');
    if (!isFlat) {
      headerEl.addEventListener('click', (e) => {
        if (e.target.closest('.cat-edit-btn')) return;
        el.classList.toggle('open');
      });
    }
    const body = el.querySelector('.category-body');
    renderCategoryBody(cat, body);

    // Im Admin-Modus lässt sich diese Kategorie direkt hier auf der
    // Bereichs-Seite bearbeiten und innerhalb des Bereichs verschieben,
    // ohne extra in einen separaten Admin-Bereich wechseln zu müssen.
    if (isAdminActive()) {
      const actionsWrap = el.querySelector('.category-header-actions');
      if (idx > 0) {
        const upBtn = document.createElement('button');
        upBtn.type = 'button'; upBtn.className = 'btn-icon-text cat-move-btn'; upBtn.textContent = 'Hoch';
        upBtn.addEventListener('click', (e) => { e.stopPropagation(); moveCategoryInSection(filtered, idx, -1); });
        actionsWrap.appendChild(upBtn);
      }
      if (idx < filtered.length - 1) {
        const downBtn = document.createElement('button');
        downBtn.type = 'button'; downBtn.className = 'btn-icon-text cat-move-btn'; downBtn.textContent = 'Runter';
        downBtn.addEventListener('click', (e) => { e.stopPropagation(); moveCategoryInSection(filtered, idx, 1); });
        actionsWrap.appendChild(downBtn);
      }
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn-icon-text cat-edit-btn';
      editBtn.textContent = 'Bearbeiten';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (el.classList.contains('editing')) closeEdit();
        else openEdit();
      });
      actionsWrap.appendChild(editBtn);

      function openEdit() {
        el.classList.add('open', 'editing');
        editBtn.textContent = 'Fertig';
        body.innerHTML = '';
        const editor = buildCategoryEditor(cat, {
          inline: true,
          onCancel: () => closeEdit(),
          onSaved: async () => { await loadCategories(); renderCategories(); },
          onDeleted: async () => { await loadCategories(); renderCategories(); }
        });
        body.appendChild(editor);
      }
      function closeEdit() {
        el.classList.remove('editing');
        editBtn.textContent = 'Bearbeiten';
        body.innerHTML = '';
        renderCategoryBody(cat, body);
        startCountdowns();
      }
    }

    list.appendChild(el);
  });

  if (isAdminActive()) {
    const addWrap = document.createElement('div');
    addWrap.className = 'admin-inline-add';
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn btn-secondary';
    addBtn.textContent = '+ Kategorie in diesem Bereich hinzufügen';
    addBtn.addEventListener('click', async () => {
      addBtn.disabled = true;
      try {
        const maxOrder = state.categories.reduce((m, c) => Math.max(m, c.order || 0), -1);
        await addDoc(collection(db, 'categories'), {
          title: 'Neue Kategorie', type: 'info', content: '', images: [], order: maxOrder + 1,
          countdownTo: '', sectionId: state.currentSection
        });
        await loadCategories();
        renderCategories();
      } catch (err) {
        console.error('Kategorie konnte nicht angelegt werden:', err);
        alert('Kategorie anlegen hat leider nicht geklappt. Bitte nochmal versuchen.');
      } finally {
        addBtn.disabled = false;
      }
    });
    addWrap.appendChild(addBtn);
    list.appendChild(addWrap);
  }
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
  updateAdminButtonVisibility();
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
$('#btn-open-admin').addEventListener('click', async () => {
  if (state.isAdmin) {
    // Schaltet die Bearbeiten-Werkzeuge auf den Gast-Seiten an/aus, ohne
    // sich auszuloggen - so kann man kurz als Gast vorschauen und wieder
    // zurückschalten. Der komplette Admin-Bereich (Startseite, Design,
    // Gästeliste, Antworten) bleibt über den Link auf der Übersicht erreichbar.
    state.adminModeOn = !state.adminModeOn;
    updateAdminButtonVisibility();
    refreshCurrentScreen();
  } else {
    $('#admin-login-modal').classList.remove('hidden');
  }
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

// Zeigt nach dem Einloggen (oder bei einer bereits laufenden Admin-Sitzung
// nach einem Neuladen der Seite) die gerade sichtbare Gast-Seite direkt mit
// den Bearbeiten-Knöpfen an - ohne automatisch in den separaten
// Admin-Bereich zu springen. So kann man als Admin ganz normal auf der
// Hub- oder Bereichs-Seite weiterklicken und dort direkt bearbeiten.
function refreshCurrentScreen() {
  const active = document.querySelector('.screen.active');
  if (!active) return;
  if (active.id === 'screen-hub') { renderHub(); }
  else if (active.id === 'screen-main') { renderCategories(); }
}

onAuthStateChanged(auth, async (user) => {
  state.isAdmin = !!user;
  if (user) state.adminModeOn = true;
  updateAdminButtonVisibility();
  if (user) {
    try {
      await loadAdminData();
    } catch (err) {
      console.error('Admin-Daten konnten nicht geladen werden:', err);
    }
    refreshCurrentScreen();
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
  await loadSectionsAdmin();
  await loadCategoriesAdmin();
  await loadGuests();
  await loadAllResponses();
}

// ---------------------------------------------------------------
// Admin: Bereiche verwalten
// ---------------------------------------------------------------
async function loadSectionsAdmin() {
  await loadSections();
  renderAdminSections();
}

// ---------------------------------------------------------------
// Wiederverwendbarer Bereichs-Editor: wird sowohl im flachen Admin-Tab
// "Bereiche" als auch direkt inline auf der Übersichts-Seite (Hub)
// verwendet, wenn man als Admin eingeloggt ist.
// ---------------------------------------------------------------
function buildSectionEditor(sec, opts) {
  opts = opts || {};
  const catCount = state.categories.filter(c => c.sectionId === sec.id).length;
  const el = document.createElement('div');
  el.className = 'admin-cat-item' + (opts.inline ? ' admin-cat-item--inline' : '');
  el.innerHTML = `
    <div class="admin-cat-item-header">
      <strong>${escapeHtml(sec.title || 'Neuer Bereich')}</strong>
      <button type="button" class="btn-icon-text" data-action="delete">Löschen</button>
    </div>
    <label>Titel</label>
    <input type="text" data-field="title" value="${escapeHtml(sec.title || '')}">
    <label>Beschreibung</label>
    <textarea data-field="desc" rows="2">${escapeHtml(sec.desc || '')}</textarea>
    <p class="muted small">${catCount} ${catCount === 1 ? 'Kategorie ist' : 'Kategorien sind'} diesem Bereich zugeordnet.</p>
    <div class="admin-inline-actions">
      <button type="button" class="btn btn-primary" data-action="save">Speichern</button>
      ${opts.onCancel ? '<button type="button" class="btn btn-secondary" data-action="cancel">Abbrechen</button>' : ''}
    </div>
  `;

  el.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    const msg = catCount > 0
      ? `In diesem Bereich stecken noch ${catCount} Kategorie(n). Wirklich löschen? Die Kategorien bleiben erhalten, sind danach aber keinem Bereich mehr zugeordnet.`
      : 'Diesen Bereich wirklich löschen?';
    if (!confirm(msg)) return;
    try {
      await deleteDoc(doc(db, 'sections', sec.id));
      if (opts.onDeleted) await opts.onDeleted();
    } catch (err) {
      console.error('Bereich konnte nicht gelöscht werden:', err);
      alert('Löschen hat leider nicht geklappt. Bitte nochmal versuchen.');
    }
  });

  if (opts.onCancel) {
    el.querySelector('[data-action="cancel"]').addEventListener('click', () => opts.onCancel());
  }

  const saveBtn = el.querySelector('[data-action="save"]');
  saveBtn.addEventListener('click', async () => {
    const updated = {
      title: el.querySelector('[data-field="title"]').value.trim(),
      desc: el.querySelector('[data-field="desc"]').value.trim(),
      order: sec.order || 0
    };
    const ok = await withSaveFeedback(saveBtn, () => saveSection(sec.id, updated));
    if (ok && opts.onSaved) await opts.onSaved({ id: sec.id, ...updated });
  });

  return el;
}

function renderAdminSections() {
  const wrap = $('#admin-sections-list');
  wrap.innerHTML = '';
  state.sections.forEach((sec, idx) => {
    const el = buildSectionEditor(sec, {
      onSaved: async () => { await loadSectionsAdmin(); renderAdminCategories(); },
      onDeleted: async () => { await loadSectionsAdmin(); }
    });
    const header = el.querySelector('.admin-cat-item-header');
    const upBtn = document.createElement('button');
    upBtn.type = 'button'; upBtn.className = 'btn-icon-text'; upBtn.textContent = 'Hoch';
    upBtn.addEventListener('click', () => moveSection(idx, -1));
    const downBtn = document.createElement('button');
    downBtn.type = 'button'; downBtn.className = 'btn-icon-text'; downBtn.textContent = 'Runter';
    downBtn.addEventListener('click', () => moveSection(idx, 1));
    header.insertBefore(downBtn, header.firstChild);
    header.insertBefore(upBtn, header.firstChild);
    wrap.appendChild(el);
  });
}

async function saveSection(id, updated) {
  await setDoc(doc(db, 'sections', id), updated);
}

async function moveSection(idx, dir) {
  const other = idx + dir;
  if (other < 0 || other >= state.sections.length) return;
  const a = state.sections[idx];
  const b = state.sections[other];
  try {
    await updateDoc(doc(db, 'sections', a.id), { order: b.order });
    await updateDoc(doc(db, 'sections', b.id), { order: a.order });
    await loadSectionsAdmin();
  } catch (err) {
    console.error('Verschieben fehlgeschlagen:', err);
    alert('Verschieben hat leider nicht geklappt. Bitte nochmal versuchen.');
  }
}

$('#btn-add-section').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    const maxOrder = state.sections.reduce((m, s) => Math.max(m, s.order || 0), -1);
    await addDoc(collection(db, 'sections'), { title: 'Neuer Bereich', desc: '', order: maxOrder + 1 });
    await loadSectionsAdmin();
  } catch (err) {
    console.error('Bereich konnte nicht angelegt werden:', err);
    alert('Bereich anlegen hat leider nicht geklappt. Bitte nochmal versuchen.');
  } finally {
    btn.disabled = false;
  }
});

$('#btn-seed-sections').addEventListener('click', async (e) => {
  if (!confirm('Standard-Bereiche einfügen? (Bestehende bleiben erhalten)')) return;
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    for (const s of DEFAULT_SECTIONS) {
      await addDoc(collection(db, 'sections'), s);
    }
    await loadSectionsAdmin();
  } catch (err) {
    console.error('Standard-Bereiche konnten nicht angelegt werden:', err);
    alert('Das hat leider nicht geklappt. Bitte nochmal versuchen.');
  } finally {
    btn.disabled = false;
  }
});

async function loadCategoriesAdmin() {
  await fetchCategories();
  renderAdminCategories();
}

// ---------------------------------------------------------------
// Wiederverwendbarer Kategorie-Editor: wird sowohl im flachen Admin-Tab
// "Kategorien" als auch direkt inline auf der Bereichs-Seite verwendet,
// wenn man als Admin eingeloggt ist.
// ---------------------------------------------------------------
function buildCategoryEditor(cat, opts) {
  opts = opts || {};
  const el = document.createElement('div');
  el.className = 'admin-cat-item' + (opts.inline ? ' admin-cat-item--inline' : '');
  el.innerHTML = `
      <div class="admin-cat-item-header">
        <strong>${escapeHtml(cat.title || 'Neue Kategorie')}</strong>
        <button type="button" class="btn-icon-text" data-action="delete">Löschen</button>
      </div>
      <label>Titel</label>
      <input type="text" data-field="title" value="${escapeHtml(cat.title || '')}">
      <label>Bereich (Ansicht für Gäste)</label>
      <select data-field="sectionId">
        <option value="" ${!state.sections.some(s => s.id === cat.sectionId) ? 'selected' : ''}>– Kein Bereich –</option>
        ${state.sections.map(s => `<option value="${s.id}" ${cat.sectionId === s.id ? 'selected' : ''}>${escapeHtml(s.title)}</option>`).join('')}
      </select>
      <label>Typ (Darstellung)</label>
      <select data-field="type">
        <option value="info" ${cat.type === 'info' ? 'selected' : ''}>Info-Text</option>
        <option value="faq" ${cat.type === 'faq' ? 'selected' : ''}>Frage &amp; Antwort</option>
        <option value="form" ${cat.type === 'form' ? 'selected' : ''}>Formular für Gäste</option>
        <option value="checklist" ${cat.type === 'checklist' ? 'selected' : ''}>Checkliste mit Fortschritt</option>
        <option value="day" ${cat.type === 'day' ? 'selected' : ''}>Tag im Tagesplan</option>
        <option value="gallery" ${cat.type === 'gallery' ? 'selected' : ''}>Foto-Galerie zum Hochladen</option>
        <option value="assignment" ${cat.type === 'assignment' ? 'selected' : ''}>Zuteilung (z.B. "Dein Teil")</option>
      </select>

      <div class="cat-block cat-block-info">
        <label>Inhalt</label>
        <textarea data-field="content" rows="3">${escapeHtml(cat.content || '')}</textarea>
      </div>

      <div class="cat-block cat-block-faq">
        <label>Fragen und Antworten</label>
        <div class="qna-editor"></div>
        <button type="button" class="btn btn-secondary btn-small" data-action="add-qna">Frage hinzufügen</button>
      </div>

      <div class="cat-block cat-block-form">
        <label>Formularfelder</label>
        <div class="fields-editor"></div>
        <button type="button" class="btn btn-secondary btn-small" data-action="add-field">Feld hinzufügen</button>
      </div>

      <div class="cat-block cat-block-checklist">
        <label>Checklisten-Punkte</label>
        <div class="items-editor"></div>
        <button type="button" class="btn btn-secondary btn-small" data-action="add-item">Punkt hinzufügen</button>
      </div>

      <div class="cat-block cat-block-gallery">
        <p class="muted small">Für diesen Typ gibt es kein zusätzliches Formular: Gäste sehen direkt einen "Fotos hochladen"-Button sowie alle bisher hochgeladenen Fotos.</p>
      </div>

      <div class="cat-block cat-block-assignment">
        <label>Zuteilungen (wer macht was, kein Haken-/Fortschritts-Punkt)</label>
        <datalist id="guest-names-list-${cat.id || 'new'}">
          ${state.guests.map(g => `<option value="${escapeHtml(g.name)}"></option>`).join('')}
        </datalist>
        <div class="assignments-editor"></div>
        <button type="button" class="btn btn-secondary btn-small" data-action="add-assignment">Zuteilung hinzufügen</button>
      </div>

      <label>Eigener Countdown (optional, Datum und Uhrzeit)</label>
      <input type="datetime-local" data-field="countdownTo" value="${cat.countdownTo || ''}">

      <label>Bilder (eine Bild-URL pro Zeile, optional)</label>
      <textarea data-field="images" rows="2" placeholder="https://...">${escapeHtml((cat.images || []).join('\n'))}</textarea>

      <div class="admin-inline-actions">
        <button type="button" class="btn btn-primary" data-action="save">Speichern</button>
        ${opts.onCancel ? '<button type="button" class="btn btn-secondary" data-action="cancel">Abbrechen</button>' : ''}
      </div>
    `;

    function updateBlocks(type) {
      el.querySelector('.cat-block-info').style.display = (type === 'info' || type === 'day') ? '' : 'none';
      el.querySelector('.cat-block-faq').style.display = type === 'faq' ? '' : 'none';
      el.querySelector('.cat-block-form').style.display = type === 'form' ? '' : 'none';
      el.querySelector('.cat-block-checklist').style.display = type === 'checklist' ? '' : 'none';
      el.querySelector('.cat-block-gallery').style.display = type === 'gallery' ? '' : 'none';
      el.querySelector('.cat-block-assignment').style.display = type === 'assignment' ? '' : 'none';
    }
    updateBlocks(cat.type);

    let localFields = JSON.parse(JSON.stringify(cat.fields || []));
    let localQna = JSON.parse(JSON.stringify(cat.qna || []));
    let localItems = JSON.parse(JSON.stringify(cat.items || []));
    let localAssignments = JSON.parse(JSON.stringify(cat.assignments || []));

    // Formularfelder: bei Auswahl-Feldern ("select") gibt es pro Feld eine
    // eigene Liste mit einzelnen, entfernbaren Auswahlmöglichkeiten statt
    // eines einzelnen kommagetrennten Textfelds - deutlich übersichtlicher.
    const fieldsEditor = el.querySelector('.fields-editor');
    function renderFieldsEditor() {
      fieldsEditor.innerHTML = '';
      localFields.forEach((f, fi) => {
        if (!f.options) f.options = [];
        const rowWrap = document.createElement('div');
        rowWrap.className = 'field-row-wrap';
        rowWrap.innerHTML = `
          <div class="field-row">
            <input type="text" placeholder="Feldname (z.B. allergien)" data-fkey value="${escapeHtml(f.key || '')}" style="width:26%">
            <input type="text" placeholder="Beschriftung" data-flabel value="${escapeHtml(f.label || '')}" style="width:26%">
            <select data-ftype style="width:20%">
              <option value="text" ${f.type === 'text' ? 'selected' : ''}>Text</option>
              <option value="textarea" ${f.type === 'textarea' ? 'selected' : ''}>Mehrzeilig</option>
              <option value="select" ${f.type === 'select' ? 'selected' : ''}>Auswahl (eine Option)</option>
              <option value="multiselect" ${f.type === 'multiselect' ? 'selected' : ''}>Mehrfachauswahl (mehrere Optionen)</option>
            </select>
            <button type="button" class="btn-icon-text" data-remove-field>Entfernen</button>
          </div>
          <div class="field-options-block" style="${(f.type === 'select' || f.type === 'multiselect') ? '' : 'display:none'}">
            <label class="field-options-label">Auswahlmöglichkeiten (das können Gäste auswählen)</label>
            <div class="field-options-editor"></div>
            <button type="button" class="btn-icon-text btn-small" data-add-option>+ Auswahlmöglichkeit hinzufügen</button>
          </div>
        `;
        rowWrap.querySelector('[data-fkey]').addEventListener('input', e => localFields[fi].key = e.target.value);
        rowWrap.querySelector('[data-flabel]').addEventListener('input', e => localFields[fi].label = e.target.value);
        const typeSel = rowWrap.querySelector('[data-ftype]');
        const optsBlock = rowWrap.querySelector('.field-options-block');
        typeSel.addEventListener('change', e => {
          localFields[fi].type = e.target.value;
          optsBlock.style.display = (e.target.value === 'select' || e.target.value === 'multiselect') ? '' : 'none';
        });
        rowWrap.querySelector('[data-remove-field]').addEventListener('click', () => {
          localFields.splice(fi, 1);
          renderFieldsEditor();
        });
        const fieldRemoveBtn = rowWrap.querySelector('[data-remove-field]');
        if (fi > 0) {
          const upBtn = document.createElement('button');
          upBtn.type = 'button';
          upBtn.className = 'btn-icon-text';
          upBtn.textContent = 'Hoch';
          upBtn.addEventListener('click', () => { moveInArray(localFields, fi, -1); renderFieldsEditor(); });
          fieldRemoveBtn.parentNode.insertBefore(upBtn, fieldRemoveBtn);
        }
        if (fi < localFields.length - 1) {
          const downBtn = document.createElement('button');
          downBtn.type = 'button';
          downBtn.className = 'btn-icon-text';
          downBtn.textContent = 'Runter';
          downBtn.addEventListener('click', () => { moveInArray(localFields, fi, 1); renderFieldsEditor(); });
          fieldRemoveBtn.parentNode.insertBefore(downBtn, fieldRemoveBtn);
        }

        const optionsEditor = rowWrap.querySelector('.field-options-editor');
        function renderOptionsEditor() {
          optionsEditor.innerHTML = '';
          (localFields[fi].options || []).forEach((opt, oi) => {
            const orow = document.createElement('div');
            orow.className = 'option-row';
            orow.innerHTML = `
              <input type="text" placeholder="Auswahlmöglichkeit" data-opt value="${escapeHtml(opt)}">
              <button type="button" class="btn-icon-text" data-remove-opt>Entfernen</button>
            `;
            orow.querySelector('[data-opt]').addEventListener('input', e => {
              localFields[fi].options[oi] = e.target.value;
            });
            orow.querySelector('[data-remove-opt]').addEventListener('click', () => {
              localFields[fi].options.splice(oi, 1);
              renderOptionsEditor();
            });
            const optRemoveBtn = orow.querySelector('[data-remove-opt]');
            if (oi > 0) {
              const upBtn = document.createElement('button');
              upBtn.type = 'button';
              upBtn.className = 'btn-icon-text';
              upBtn.textContent = 'Hoch';
              upBtn.addEventListener('click', () => { moveInArray(localFields[fi].options, oi, -1); renderOptionsEditor(); });
              optRemoveBtn.parentNode.insertBefore(upBtn, optRemoveBtn);
            }
            if (oi < (localFields[fi].options || []).length - 1) {
              const downBtn = document.createElement('button');
              downBtn.type = 'button';
              downBtn.className = 'btn-icon-text';
              downBtn.textContent = 'Runter';
              downBtn.addEventListener('click', () => { moveInArray(localFields[fi].options, oi, 1); renderOptionsEditor(); });
              optRemoveBtn.parentNode.insertBefore(downBtn, optRemoveBtn);
            }
            optionsEditor.appendChild(orow);
          });
          if (!(localFields[fi].options || []).length) {
            const hint = document.createElement('p');
            hint.className = 'muted small';
            hint.textContent = 'Noch keine Auswahlmöglichkeiten.';
            optionsEditor.appendChild(hint);
          }
        }
        renderOptionsEditor();
        rowWrap.querySelector('[data-add-option]').addEventListener('click', () => {
          localFields[fi].options = localFields[fi].options || [];
          localFields[fi].options.push('');
          renderOptionsEditor();
        });

        fieldsEditor.appendChild(rowWrap);
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
        const qnaRemoveBtn = row.querySelector('[data-remove-qna]');
        if (qi > 0) {
          const upBtn = document.createElement('button');
          upBtn.type = 'button';
          upBtn.className = 'btn-icon-text';
          upBtn.textContent = 'Hoch';
          upBtn.addEventListener('click', () => { moveInArray(localQna, qi, -1); renderQnaEditor(); });
          qnaRemoveBtn.parentNode.insertBefore(upBtn, qnaRemoveBtn);
        }
        if (qi < localQna.length - 1) {
          const downBtn = document.createElement('button');
          downBtn.type = 'button';
          downBtn.className = 'btn-icon-text';
          downBtn.textContent = 'Runter';
          downBtn.addEventListener('click', () => { moveInArray(localQna, qi, 1); renderQnaEditor(); });
          qnaRemoveBtn.parentNode.insertBefore(downBtn, qnaRemoveBtn);
        }
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
        const itemRemoveBtn = row.querySelector('[data-remove-item]');
        if (ii > 0) {
          const upBtn = document.createElement('button');
          upBtn.type = 'button';
          upBtn.className = 'btn-icon-text';
          upBtn.textContent = 'Hoch';
          upBtn.addEventListener('click', () => { moveInArray(localItems, ii, -1); renderItemsEditor(); });
          itemRemoveBtn.parentNode.insertBefore(upBtn, itemRemoveBtn);
        }
        if (ii < localItems.length - 1) {
          const downBtn = document.createElement('button');
          downBtn.type = 'button';
          downBtn.className = 'btn-icon-text';
          downBtn.textContent = 'Runter';
          downBtn.addEventListener('click', () => { moveInArray(localItems, ii, 1); renderItemsEditor(); });
          itemRemoveBtn.parentNode.insertBefore(downBtn, itemRemoveBtn);
        }
        itemsEditor.appendChild(row);
      });
    }
    renderItemsEditor();

    const assignmentsEditor = el.querySelector('.assignments-editor');
    function renderAssignmentsEditor() {
      assignmentsEditor.innerHTML = '';
      localAssignments.forEach((a, ai) => {
        const row = document.createElement('div');
        row.className = 'assignment-row';
        row.innerHTML = `
          <input type="text" placeholder="Name" data-aname value="${escapeHtml(a.name || '')}" list="guest-names-list-${cat.id || 'new'}">
          <input type="text" placeholder='z.B. "Kümmert sich um die Deko am Weißabend"' data-atext value="${escapeHtml(a.text || '')}">
          <button type="button" class="btn-icon-text" data-remove-assignment>Entfernen</button>
        `;
        row.querySelector('[data-aname]').addEventListener('input', e => localAssignments[ai].name = e.target.value);
        row.querySelector('[data-atext]').addEventListener('input', e => localAssignments[ai].text = e.target.value);
        row.querySelector('[data-remove-assignment]').addEventListener('click', () => {
          localAssignments.splice(ai, 1);
          renderAssignmentsEditor();
        });
        const assignmentRemoveBtn = row.querySelector('[data-remove-assignment]');
        if (ai > 0) {
          const upBtn = document.createElement('button');
          upBtn.type = 'button';
          upBtn.className = 'btn-icon-text';
          upBtn.textContent = 'Hoch';
          upBtn.addEventListener('click', () => { moveInArray(localAssignments, ai, -1); renderAssignmentsEditor(); });
          assignmentRemoveBtn.parentNode.insertBefore(upBtn, assignmentRemoveBtn);
        }
        if (ai < localAssignments.length - 1) {
          const downBtn = document.createElement('button');
          downBtn.type = 'button';
          downBtn.className = 'btn-icon-text';
          downBtn.textContent = 'Runter';
          downBtn.addEventListener('click', () => { moveInArray(localAssignments, ai, 1); renderAssignmentsEditor(); });
          assignmentRemoveBtn.parentNode.insertBefore(downBtn, assignmentRemoveBtn);
        }
        assignmentsEditor.appendChild(row);
      });
    }
    renderAssignmentsEditor();

    el.querySelector('[data-action="add-assignment"]').addEventListener('click', () => {
      localAssignments.push({ name: '', text: '' });
      renderAssignmentsEditor();
    });

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

    el.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      if (!confirm('Diese Kategorie wirklich löschen?')) return;
      try {
        await deleteDoc(doc(db, 'categories', cat.id));
        if (opts.onDeleted) await opts.onDeleted();
      } catch (err) {
        console.error('Kategorie konnte nicht gelöscht werden:', err);
        alert('Löschen hat leider nicht geklappt. Bitte nochmal versuchen.');
      }
    });

    if (opts.onCancel) {
      el.querySelector('[data-action="cancel"]').addEventListener('click', () => opts.onCancel());
    }

    const saveBtn = el.querySelector('[data-action="save"]');
    saveBtn.addEventListener('click', async () => {
      const type = typeSelect.value;
      const updated = {
        title: el.querySelector('[data-field="title"]').value.trim(),
        type,
        sectionId: el.querySelector('[data-field="sectionId"]').value,
        order: cat.order || 0,
        countdownTo: el.querySelector('[data-field="countdownTo"]').value,
        images: el.querySelector('[data-field="images"]').value.split('\n').map(s => s.trim()).filter(Boolean)
      };
      if (type === 'info' || type === 'day') {
        updated.content = el.querySelector('[data-field="content"]').value;
      } else if (type === 'faq') {
        updated.qna = localQna.filter(q => (q.question || '').trim() && (q.answer || '').trim());
      } else if (type === 'form') {
        updated.fields = localFields.filter(f => f.key && f.label).map(f => ({ ...f, options: (f.options || []).map(o => (o || '').trim()).filter(Boolean) }));
      } else if (type === 'checklist') {
        updated.items = localItems.filter(it => it.label && it.label.trim());
      } else if (type === 'assignment') {
        updated.assignments = localAssignments.filter(a => (a.name || '').trim() && (a.text || '').trim());
      }
      const ok = await withSaveFeedback(saveBtn, () => saveCategory(cat.id, updated));
      if (ok && opts.onSaved) await opts.onSaved({ id: cat.id, ...updated });
    });

  return el;
}

function renderAdminCategories() {
  const wrap = $('#admin-categories-list');
  wrap.innerHTML = '';
  state.categories.forEach((cat, idx) => {
    const el = buildCategoryEditor(cat, {
      onSaved: async () => { await loadCategoriesAdmin(); },
      onDeleted: async () => { await loadCategoriesAdmin(); }
    });
    const header = el.querySelector('.admin-cat-item-header');
    const upBtn = document.createElement('button');
    upBtn.type = 'button'; upBtn.className = 'btn-icon-text'; upBtn.textContent = 'Hoch';
    upBtn.addEventListener('click', () => moveCategory(idx, -1));
    const downBtn = document.createElement('button');
    downBtn.type = 'button'; downBtn.className = 'btn-icon-text'; downBtn.textContent = 'Runter';
    downBtn.addEventListener('click', () => moveCategory(idx, 1));
    header.insertBefore(downBtn, header.firstChild);
    header.insertBefore(upBtn, header.firstChild);
    wrap.appendChild(el);
  });
}

async function saveCategory(id, updated) {
  await setDoc(doc(db, 'categories', id), updated);
}

async function moveCategory(idx, dir) {
  const other = idx + dir;
  if (other < 0 || other >= state.categories.length) return;
  const a = state.categories[idx];
  const b = state.categories[other];
  try {
    await updateDoc(doc(db, 'categories', a.id), { order: b.order });
    await updateDoc(doc(db, 'categories', b.id), { order: a.order });
    await loadCategoriesAdmin();
  } catch (err) {
    console.error('Verschieben fehlgeschlagen:', err);
    alert('Verschieben hat leider nicht geklappt. Bitte nochmal versuchen.');
  }
}

$('#btn-add-category').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    const maxOrder = state.categories.reduce((m, c) => Math.max(m, c.order || 0), -1);
    const defaultSectionId = state.sections[0] ? state.sections[0].id : '';
    await addDoc(collection(db, 'categories'), {
      title: 'Neue Kategorie', type: 'info', content: '', images: [], order: maxOrder + 1, countdownTo: '', sectionId: defaultSectionId
    });
    await loadCategoriesAdmin();
  } catch (err) {
    console.error('Kategorie konnte nicht angelegt werden:', err);
    alert('Kategorie anlegen hat leider nicht geklappt. Bitte nochmal versuchen.');
  } finally {
    btn.disabled = false;
  }
});

$('#btn-seed-categories').addEventListener('click', async (e) => {
  if (!confirm('Standard-Kategorien einfügen? (Bestehende bleiben erhalten)')) return;
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    const bySectionTitle = {};
    state.sections.forEach(s => { bySectionTitle[s.title] = s.id; });
    for (const c of DEFAULT_CATEGORIES) {
      const wantedTitle = LEGACY_TYPE_SECTION_TITLE[c.type];
      const sectionId = (wantedTitle && bySectionTitle[wantedTitle]) || (state.sections[0] && state.sections[0].id) || '';
      await addDoc(collection(db, 'categories'), { ...c, sectionId });
    }
    await loadCategoriesAdmin();
  } catch (err) {
    console.error('Standard-Kategorien konnten nicht angelegt werden:', err);
    alert('Das hat leider nicht geklappt. Bitte nochmal versuchen.');
  } finally {
    btn.disabled = false;
  }
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
      try {
        await deleteDoc(doc(db, 'guests', g.id));
        await loadGuests();
      } catch (err) {
        console.error('Gast konnte nicht gelöscht werden:', err);
        alert('Löschen hat leider nicht geklappt. Bitte nochmal versuchen.');
      }
    });
    wrap.appendChild(row);
  });
}

$('#btn-add-guest').addEventListener('click', async (e) => {
  const name = $('#new-guest-name').value.trim();
  if (!name) return;
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    await addDoc(collection(db, 'guests'), { name });
    $('#new-guest-name').value = '';
    await loadGuests();
  } catch (err) {
    console.error('Gast konnte nicht angelegt werden:', err);
    alert('Anlegen hat leider nicht geklappt. Bitte nochmal versuchen.');
  } finally {
    btn.disabled = false;
  }
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
      const inner = Object.entries(vals).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(', ');
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
        rows.push([r.guestName || r.id, catTitles[catId] || catId, k, Array.isArray(v) ? v.join(', ') : v]);
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
  await loadSections();
  await loadCategories();
  startCountdowns();
  updateAdminButtonVisibility();
  if (state.currentGuest) {
    await loadResponsesForCurrentGuest();
  }
})();
