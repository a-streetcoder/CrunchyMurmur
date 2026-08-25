// Tab switching. Settings is a single tab with its own horizontal section
// nav; the pre-unification tab names (general/engine/templates) are kept as
// aliases so existing jump links and callers keep working.
function switchSettingsSection(section, anchorId = '') {
  document.querySelectorAll('.settings-nav-item').forEach((button) => button.classList.toggle('active', button.dataset.settingsSection === section));
  document.querySelectorAll('.settings-section').forEach((s) => s.classList.toggle('active', s.id === 'settings-' + section));
  if (anchorId) requestAnimationFrame(() => document.getElementById(anchorId)?.scrollIntoView({ block: 'start' }));
  else document.querySelector('.settings-body')?.scrollTo(0, 0);
}
function switchTab(tab, engineSection = '') {
  const legacySettings = {
    general: 'general',
    templates: 'templates',
    engine: engineSection === 'ai-notes' ? 'ai-notes' : 'transcription',
  };
  if (legacySettings[tab]) {
    switchTab('settings');
    switchSettingsSection(legacySettings[tab], tab === 'engine' && engineSection === 'models' ? 'engineModels' : '');
    return;
  }
  document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + tab));
}
document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab, btn.dataset.engineSection || ''));
});
document.querySelectorAll('.settings-nav-item').forEach((btn) => {
  btn.addEventListener('click', () => switchSettingsSection(btn.dataset.settingsSection));
});
// Allow inline links to jump tabs (e.g. Settings → "Models" hint).
document.addEventListener('click', (e) => {
  const t = e.target;
  if (t && t.matches && t.matches('[data-jump-tab]')) {
    e.preventDefault();
    switchTab(t.getAttribute('data-jump-tab'), t.getAttribute('data-engine-section') || '');
  }
});

// History
const historyEl = document.getElementById('history');
const emptyEl = document.getElementById('empty');
const countEl = document.getElementById('count');
const searchEl = document.getElementById('search');
const clearAllBtn = document.getElementById('clearAll');

let entries = [];
let filter = '';

function formatCompact(value) {
  const number = Number(value) || 0;
  return new Intl.NumberFormat(window.i18n.locale, { notation: 'compact', maximumFractionDigits: 1 }).format(number);
}

async function renderDashboard() {
  const stats = await window.wisper.getHistoryStats();
  document.getElementById('statTotalWords').textContent = formatCompact(stats.totalWords);
  document.getElementById('statWpm').textContent = stats.wordsPerMinute || '—';
  document.getElementById('statStreak').textContent = stats.dayStreak;
  document.getElementById('dashboardEmptyHint').hidden = stats.recordingCount > 0;
}

function relativeTime(iso) {
  const ts = new Date(iso).getTime();
  const diffSec = Math.max(0, (Date.now() - ts) / 1000);
  const formatter = new Intl.RelativeTimeFormat(window.i18n.locale, { numeric: 'auto', style: 'short' });
  if (diffSec < 60) return formatter.format(0, 'second');
  if (diffSec < 3600) return formatter.format(-Math.floor(diffSec / 60), 'minute');
  if (diffSec < 86400) return formatter.format(-Math.floor(diffSec / 3600), 'hour');
  return formatter.format(-Math.floor(diffSec / 86400), 'day');
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString(window.i18n.locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function copyEntry(id, btn) {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;
  await window.wisper.copyText(entry.text);
  if (btn) {
    const original = btn.textContent;
    btn.textContent = 'Copied';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = original; btn.classList.remove('copied'); }, 1200);
  }
}

async function deleteEntry(id) {
  entries = await window.wisper.removeHistory(id);
  render();
  renderDashboard();
}

function render() {
  const q = filter.trim().toLowerCase();
  const visible = q ? entries.filter((e) => e.text.toLowerCase().includes(q)) : entries;

  countEl.textContent = visible.length + (visible.length === 1 ? ' entry' : ' entries');
  // Mac hides Clear All when the list is empty.
  clearAllBtn.style.display = entries.length === 0 ? 'none' : '';

  if (visible.length === 0) {
    historyEl.innerHTML = '';
    emptyEl.classList.add('show');
    return;
  }
  emptyEl.classList.remove('show');

  historyEl.innerHTML = visible.map((e) => `
    <div class="entry" data-id="${e.id}">
      <div class="text">${escapeHtml(e.text)}</div>
      <div class="entry-footer">
        <div class="meta">
          <span class="ts">${formatDate(e.createdAt)}</span>
          <span class="dot-sep">·</span>
          <span class="ts">${relativeTime(e.createdAt)}</span>
          ${e.language && e.language !== 'auto' ? `<span class="lang">${escapeHtml(e.language.toUpperCase())}</span>` : ''}
        </div>
        ${e.text.length > 220 ? '<button class="text-button entry-expand" data-action="expand">Show more</button>' : ''}
        <div class="actions">
          <button class="text-button" data-action="copy">Copy</button>
          <button class="text-button danger" data-action="delete">Delete</button>
        </div>
      </div>
    </div>
  `).join('');

  historyEl.querySelectorAll('.entry').forEach((el) => {
    const id = el.dataset.id;
    const copyBtn = el.querySelector('[data-action="copy"]');
    const deleteBtn = el.querySelector('[data-action="delete"]');
    const expandBtn = el.querySelector('[data-action="expand"]');
    copyBtn.addEventListener('click', () => copyEntry(id, copyBtn));
    deleteBtn.addEventListener('click', () => deleteEntry(id));
    expandBtn?.addEventListener('click', () => {
      const expanded = el.classList.toggle('expanded');
      expandBtn.textContent = expanded ? 'Show less' : 'Show more';
    });

    // Right-click context menu — Copy / Generate AI note / Delete.
    el.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      showContextMenu(ev.clientX, ev.clientY, [
        { label: 'Copy', action: () => copyEntry(id, copyBtn) },
        { label: 'Generate AI note…', action: () => openAINotePopup(id, ev.clientX, ev.clientY) },
        { label: 'Delete', danger: true, action: () => deleteEntry(id) },
      ]);
    });
  });
}

// Lightweight context menu (no Electron menu plumbing — pure DOM).
function showContextMenu(x, y, items) {
  const existing = document.getElementById('ctx-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.id = 'ctx-menu';
  menu.className = 'ctx-menu';
  for (const item of items) {
    const btn = document.createElement('button');
    btn.textContent = item.label;
    if (item.danger) btn.className = 'danger';
    btn.addEventListener('click', () => {
      menu.remove();
      item.action();
    });
    menu.appendChild(btn);
  }
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  document.body.appendChild(menu);

  // Clamp to viewport.
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 6) + 'px';
  if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 6) + 'px';

  const dismiss = (ev) => {
    if (!menu.contains(ev.target)) {
      menu.remove();
      document.removeEventListener('mousedown', dismiss);
      document.removeEventListener('keydown', escDismiss);
    }
  };
  const escDismiss = (ev) => {
    if (ev.key === 'Escape') {
      menu.remove();
      document.removeEventListener('mousedown', dismiss);
      document.removeEventListener('keydown', escDismiss);
    }
  };
  setTimeout(() => {
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('keydown', escDismiss);
  }, 0);
}

searchEl.addEventListener('input', (e) => { filter = e.target.value; render(); });
clearAllBtn.addEventListener('click', async () => {
  if (!confirm('Clear all recordings?')) return;
  entries = await window.wisper.clearHistory();
  render();
  renderDashboard();
});

window.wisper.onHistoryChanged((next) => { entries = next; render(); renderDashboard(); });

// ----- Models tab -----
const modelsListEl = document.getElementById('modelsList');
const modelsDirPathEl = document.getElementById('modelsDirPath');
const openModelsFolderBtn = document.getElementById('openModelsFolder');

function formatBytes(b) {
  if (b >= 1e9) return (b / 1e9).toFixed(2) + ' GB';
  if (b >= 1e6) return (b / 1e6).toFixed(0) + ' MB';
  if (b >= 1e3) return (b / 1e3).toFixed(0) + ' KB';
  return b + ' B';
}

let catalog = [];
const downloadingIds = new Set();

function modelSpeedLabel(speed) {
  const labels = {
    Fastest: window.i18n.t('Speed: Fastest'),
    'Very fast': window.i18n.t('Speed: Very fast'),
    Fast: window.i18n.t('Speed: Fast'),
    Medium: window.i18n.t('Speed: Medium'),
    Slow: window.i18n.t('Speed: Slow'),
    Slowest: window.i18n.t('Speed: Slowest'),
  };
  return labels[speed] || speed;
}

function modelAccuracyLabel(accuracy) {
  const labels = {
    Lowest: window.i18n.t('Accuracy: Lowest'),
    Low: window.i18n.t('Accuracy: Low'),
    OK: window.i18n.t('Accuracy: OK'),
    Good: window.i18n.t('Accuracy: Good'),
    Excellent: window.i18n.t('Accuracy: Excellent'),
    High: window.i18n.t('Accuracy: High'),
    Best: window.i18n.t('Accuracy: Best'),
  };
  return labels[accuracy] || accuracy;
}

function renderModels() {
  modelsListEl.innerHTML = '';
  for (const m of catalog) {
    const card = document.createElement('div');
    card.className = 'model-card' + (m.installed ? ' installed' : '') + (downloadingIds.has(m.id) ? ' downloading' : '');
    card.dataset.id = m.id;

    const badges = [];
    if (m.recommended && !m.installed) badges.push('<span class="badge recommended">Recommended</span>');
    if (m.installed) badges.push('<span class="badge installed">Installed</span>');

    card.innerHTML = `
      <div class="name">${escapeHtml(m.name)} ${badges.join(' ')}</div>
      <div class="meta">
        <span>${formatBytes(m.size)}</span>
        <span>${escapeHtml(window.i18n.t(m.language))}</span>
        <span>${escapeHtml(modelSpeedLabel(m.speed))}</span>
        <span>${escapeHtml(modelAccuracyLabel(m.accuracy))}</span>
      </div>
      <div class="actions"></div>
      <div class="progress">
        <div class="progress-track"><div class="progress-fill"></div></div>
        <span class="progress-label">Starting…</span>
      </div>
    `;

    const actions = card.querySelector('.actions');
    if (downloadingIds.has(m.id)) {
      const cancel = document.createElement('button');
      cancel.className = 'text-button danger';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', () => window.wisper.modelsCancel(m.id));
      actions.appendChild(cancel);
    } else if (m.installed) {
      const use = document.createElement('button');
      use.className = 'text-button';
      use.textContent = 'Use this';
      use.addEventListener('click', () => useModel(m.id, m.path, m.family));
      actions.appendChild(use);

      const del = document.createElement('button');
      del.className = 'text-button danger';
      del.textContent = 'Delete';
      del.addEventListener('click', async () => {
        if (!confirm(`Delete ${m.name}? This frees ${formatBytes(m.size)} on disk.`)) return;
        await window.wisper.modelsRemove(m.id);
      });
      actions.appendChild(del);
    } else {
      const dl = document.createElement('button');
      dl.className = 'primary-button';
      dl.textContent = 'Download';
      dl.addEventListener('click', () => downloadModel(m.id));
      actions.appendChild(dl);
    }

    modelsListEl.appendChild(card);
  }
}

async function refreshCatalog() {
  catalog = await window.wisper.modelsCatalog();
  renderModels();
}

async function downloadModel(id) {
  downloadingIds.add(id);
  renderModels();
  const result = await window.wisper.modelsDownload(id);
  downloadingIds.delete(id);
  if (!result.ok) {
    // Don't alert on user-initiated cancel.
    if (!/canceled/i.test(result.error || '')) {
      alert('Download failed: ' + result.error);
    }
  }
  await refreshCatalog();
  await populateInstalledPicker();
  if (result.ok) await autoSelectDownloadedModel(id, result.path);
}

// Downloading the only model of a family is an unambiguous choice — wire it
// up so the engine card doesn't keep asking for a download that just
// finished. Only fills the blank; never overrides an existing selection.
async function autoSelectDownloadedModel(id, modelPath) {
  const family = catalog.find((m) => m.id === id)?.family;
  if (family !== 'parakeet' || !modelPath || parakeetModelPathEl.value.trim()) return;
  parakeetModelPathEl.value = modelPath;
  try {
    window.__lastSettings = await window.wisper.saveSettings({ parakeetModelPath: modelPath });
  } catch {
    // Saving can be rejected while another engine's setup is incomplete;
    // the path stays in the field and persists with the next engine save.
  }
  if (currentEngineKind() === 'parakeet') await refreshParakeetReadiness();
}

function currentEngineKind() {
  return document.querySelector('input[name="engineKind"]:checked')?.value || 'parakeet';
}

function useModel(id, modelPath, family = 'whisper') {
  switchTab('engine');
  const engineKind = family === 'parakeet' ? 'parakeet' : 'local';
  if (engineKind === 'parakeet') parakeetModelPathEl.value = modelPath;
  else {
    modelPathEl.value = modelPath;
    installedModelPickerEl.value = modelPath;
  }
  applyEngineKind(engineKind);
  window.wisper.saveSettings(engineKind === 'parakeet'
    ? { engineKind, parakeetModelPath: modelPath }
    : { engineKind, modelPath });
  engineSaveStatusEl.textContent = `Using ${id}.`;
  setTimeout(() => { engineSaveStatusEl.textContent = ''; }, 2000);
}

window.wisper.onModelProgress(({ id, bytesDone, bytesTotal }) => {
  const card = modelsListEl.querySelector(`.model-card[data-id="${CSS.escape(id)}"]`);
  if (!card) return;
  const fill = card.querySelector('.progress-fill');
  const label = card.querySelector('.progress-label');
  const pct = bytesTotal > 0 ? (bytesDone / bytesTotal) * 100 : 0;
  fill.style.width = pct.toFixed(1) + '%';
  label.textContent = `${formatBytes(bytesDone)} / ${formatBytes(bytesTotal)} · ${pct.toFixed(0)}%`;
});

window.wisper.onModelsChanged(async () => {
  await refreshCatalog();
  await populateInstalledPicker();
  // Model installs and deletes change engine readiness (e.g. the configured
  // Parakeet model was just downloaded or removed) — keep the card honest.
  if (currentEngineKind() === 'parakeet') void refreshParakeetReadiness();
});

openModelsFolderBtn.addEventListener('click', () => window.wisper.modelsOpenDir());

// ----- Notes tab -----
const foldersListEl = document.getElementById('foldersList');
const notesListEl = document.getElementById('notesList');
const notesEmptyEl = document.getElementById('notesEmpty');
const noteEditorEl = document.getElementById('noteEditor');
const notesSelectMessageEl = document.getElementById('notesSelectMessage');
const noteTitleEl = document.getElementById('noteTitle');
const noteBodyEl = document.getElementById('noteBody');
const noteBodyEditor = window.CrunchyEditor.mount(noteBodyEl, {
  stats: '#noteEditorStats',
  label: 'Note body',
  placeholder: 'Start writing…',
});
const noteSaveStatusEl = document.getElementById('noteSaveStatus');
const newFolderBtn = document.getElementById('newFolder');
const newNoteBtn = document.getElementById('newNote');
const notesSearchEl = document.getElementById('notesSearch');
const noteDeleteBtn = document.getElementById('noteDeleteBtn');
const noteMoveBtn = document.getElementById('noteMoveBtn');
const openNotesRootBtn = document.getElementById('openNotesRoot');

let notesSnapshot = { folders: [], notesByFolder: {}, counts: {} };
let selectedFolder = null;
let selectedNote = null; // { folder, filename, ... }
let notesFilter = '';
let saveTimer = null;
let saveDirty = false;
let noteSelectionVersion = 0;

function snippetOf(content) {
  // Same as Mac NoteRow: skip headings, take first non-empty body line.
  for (const line of (content || '').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('#')) continue;
    return t.slice(0, 200);
  }
  return '';
}

function renderFolders() {
  foldersListEl.innerHTML = '';
  for (const name of notesSnapshot.folders) {
    const li = document.createElement('li');
    if (name === selectedFolder) li.classList.add('active');
    li.innerHTML = `
      <span class="glyph">▣</span>
      <span class="name"></span>
      <span class="count">${notesSnapshot.counts[name] || 0}</span>
    `;
    li.querySelector('.name').textContent = name;
    li.addEventListener('click', () => {
      selectedFolder = name;
      // Pick the most recent note in the folder for convenience.
      const list = notesSnapshot.notesByFolder[name] || [];
      const next = list[0] || null;
      openNote(next);
      renderNotesTab();
    });
    li.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      showContextMenu(ev.clientX, ev.clientY, [
        { label: 'Open folder', action: () => window.wisper.notesRevealFolder(name) },
        { label: 'Rename folder', action: () => promptRenameFolder(name) },
        { label: 'Delete folder', danger: true, action: () => promptDeleteFolder(name) },
      ]);
    });
    foldersListEl.appendChild(li);
  }
}

function renderNotes() {
  const list = (notesSnapshot.notesByFolder[selectedFolder] || []);
  const q = notesFilter.trim().toLowerCase();
  const visible = q
    ? list.filter((n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
    : list;

  notesListEl.innerHTML = '';
  for (const n of visible) {
    const li = document.createElement('li');
    if (selectedNote && n.filename === selectedNote.filename && n.folder === selectedNote.folder) {
      li.classList.add('active');
    }
    const meta = `<span>${formatDate(n.modifiedAt)}</span><span>·</span><span>${relativeTime(n.modifiedAt)}</span>`;
    li.innerHTML = `
      <div class="title"></div>
      <div class="meta">${meta}</div>
      <div class="snippet"></div>
    `;
    li.querySelector('.title').textContent = n.title;
    li.querySelector('.snippet').textContent = snippetOf(n.content);
    li.addEventListener('click', () => openNote(n));
    li.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      showContextMenu(ev.clientX, ev.clientY, [
        { label: 'Move to folder…', action: () => promptMoveNote(n) },
        { label: 'Delete note', danger: true, action: () => deleteNote(n) },
      ]);
    });
    notesListEl.appendChild(li);
  }
  notesEmptyEl.classList.toggle('show', visible.length === 0);
}

function renderEditor() {
  if (!selectedNote) {
    noteEditorEl.classList.add('hidden');
    notesSelectMessageEl.classList.remove('hidden');
    return;
  }
  noteEditorEl.classList.remove('hidden');
  notesSelectMessageEl.classList.add('hidden');
  // Only update DOM if changed, so the user's caret position isn't reset
  // every time we re-render after typing.
  if (document.activeElement !== noteTitleEl) noteTitleEl.value = selectedNote.title;
  if (!noteBodyEditor.hasFocus()) noteBodyEditor.setValue(selectedNote.content);
}

function renderNotesTab() {
  renderFolders();
  renderNotes();
  renderEditor();
}

async function reloadNotes(reselectFirst = false) {
  notesSnapshot = await window.wisper.notesSnapshot();
  if (!selectedFolder || !notesSnapshot.folders.includes(selectedFolder)) {
    selectedFolder = notesSnapshot.folders[0] || null;
  }
  if (reselectFirst) {
    const list = notesSnapshot.notesByFolder[selectedFolder] || [];
    openNote(list[0] || null);
  }
  renderNotesTab();
}

function openNote(note) {
  // Flush any pending autosave for the note we're leaving before swapping.
  flushPendingSave(true);
  noteSelectionVersion += 1;
  selectedNote = note ? { ...note } : null;
  renderNotesTab();
}

function scheduleSave() {
  saveDirty = true;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushPendingSave, 400);
  noteSaveStatusEl.textContent = 'Saving…';
}

async function flushPendingSave(immediate = false) {
  if (!saveDirty || !selectedNote) {
    if (immediate && saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    return;
  }
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  saveDirty = false;
  const folder = selectedNote.folder;
  const filename = selectedNote.filename;
  const selectionVersion = noteSelectionVersion;
  const content = noteBodyEditor.getValue();
  const title = noteTitleEl.value.trim();
  const updated = await window.wisper.notesUpdate({ folder, filename, content });
  // If the title changed, rename the file (which changes the filename slug).
  if (title && updated && title !== updated.title) {
    const renamed = await window.wisper.notesRename({ folder, filename, newTitle: title });
    if (renamed) {
      if (noteSelectionVersion === selectionVersion) selectedNote = { ...renamed };
      // Renamed via in-memory update; broadcastNotes() in main fires a
      // notes:changed which will refresh everything including the list.
    }
  } else if (updated) {
    if (noteSelectionVersion === selectionVersion) selectedNote = { ...updated };
  }
  noteSaveStatusEl.textContent = 'Saved';
  setTimeout(() => { if (noteSaveStatusEl.textContent === 'Saved') noteSaveStatusEl.textContent = ''; }, 1200);
}

noteBodyEl.addEventListener('input', scheduleSave);
noteTitleEl.addEventListener('input', scheduleSave);
noteTitleEl.addEventListener('blur', () => flushPendingSave(true));

// New folder / new note / search / open in Explorer
async function promptNewFolder() {
  const name = prompt('Folder name:');
  if (!name) return;
  const normalized = name.trim().replace(/[\\/:*?"<>|]/g, '_');
  if (!normalized || normalized === '.' || normalized === '..') {
    alert('Choose a valid folder name.');
    return;
  }
  try { await window.wisper.notesCreateFolder(name); }
  catch (e) { alert('Could not create folder: ' + (e.message || e)); return; }
  selectedFolder = normalized;
  await reloadNotes();
}
newFolderBtn.addEventListener('click', promptNewFolder);

async function promptRenameFolder(oldName) {
  const newName = prompt('Rename folder to:', oldName);
  if (!newName || newName === oldName) return;
  const normalized = newName.trim().replace(/[\\/:*?"<>|]/g, '_');
  if (!normalized || normalized === '.' || normalized === '..') {
    alert('Choose a valid folder name.');
    return;
  }
  try { await window.wisper.notesRenameFolder(oldName, newName); }
  catch (e) { alert('Could not rename folder: ' + (e.message || e)); return; }
  if (selectedFolder === oldName) selectedFolder = normalized;
  await reloadNotes();
}

async function promptDeleteFolder(name) {
  const noteCount = notesSnapshot.counts[name] || 0;
  const msg = noteCount > 0
    ? `Delete folder "${name}" and ${noteCount} note${noteCount === 1 ? '' : 's'} inside? This cannot be undone.`
    : `Delete folder "${name}"?`;
  if (!confirm(msg)) return;
  await window.wisper.notesDeleteFolder(name);
  if (selectedFolder === name) {
    selectedFolder = null;
    selectedNote = null;
  }
  await reloadNotes();
}

async function promptMoveNote(note) {
  const others = notesSnapshot.folders.filter((f) => f !== note.folder);
  if (others.length === 0) { alert('No other folders. Create one first.'); return; }
  const target = prompt(`Move "${note.title}" to which folder?\n\n${others.join(', ')}`, others[0]);
  if (!target) return;
  if (!notesSnapshot.folders.includes(target)) { alert('No folder named "' + target + '".'); return; }
  const moved = await window.wisper.notesMove({ folder: note.folder, filename: note.filename, toFolder: target });
  if (moved) {
    selectedFolder = target;
    selectedNote = { ...moved };
  }
  await reloadNotes();
}

async function deleteNote(note) {
  if (!confirm(`Delete "${note.title}"?`)) return;
  await window.wisper.notesDelete({ folder: note.folder, filename: note.filename });
  if (selectedNote && selectedNote.filename === note.filename && selectedNote.folder === note.folder) {
    selectedNote = null;
  }
  await reloadNotes();
}

newNoteBtn.addEventListener('click', async () => {
  if (!selectedFolder) {
    alert('Pick or create a folder first.');
    return;
  }
  const r = await window.wisper.notesCreate({ title: '', content: '', folder: selectedFolder });
  notesSnapshot = r.snapshot;
  if (r.note) selectedNote = { ...r.note };
  renderNotesTab();
  // Move focus to the title for immediate naming.
  setTimeout(() => { noteTitleEl.focus(); noteTitleEl.select(); }, 0);
});

notesSearchEl.addEventListener('input', (e) => { notesFilter = e.target.value; renderNotes(); });

noteDeleteBtn.addEventListener('click', () => { if (selectedNote) deleteNote(selectedNote); });
noteMoveBtn.addEventListener('click', () => { if (selectedNote) promptMoveNote(selectedNote); });
openNotesRootBtn.addEventListener('click', () => window.wisper.notesOpenRoot());

window.wisper.onNotesChanged((snap) => {
  notesSnapshot = snap;
  // If our selected note was deleted/renamed externally, drop the selection.
  if (selectedNote) {
    const list = notesSnapshot.notesByFolder[selectedNote.folder] || [];
    const found = list.find((n) => n.filename === selectedNote.filename);
    if (!found) selectedNote = null;
  }
  renderNotesTab();
});

// Ensure pending saves flush when the tab is changed away.
document.querySelectorAll('.nav-item').forEach((b) => {
  b.addEventListener('click', () => { if (saveDirty) flushPendingSave(true); });
});

// ----- Templates tab -----
const templatesListEl = document.getElementById('templatesList');
const templateEditorEl = document.getElementById('templateEditor');
const templatesSelectMessageEl = document.getElementById('templatesSelectMessage');
const templateNameEl = document.getElementById('templateName');
const templateDescriptionEl = document.getElementById('templateDescription');
const templateInstructionsEl = document.getElementById('templateInstructions');
const templateInstructionsEditor = window.CrunchyEditor.mount(templateInstructionsEl, {
  stats: '#templateEditorStats',
  label: 'AI note template instructions',
  placeholder: 'Describe the structure, tone, and details the AI should produce…',
});
const templateSaveBtn = document.getElementById('templateSaveBtn');
const templateRevertBtn = document.getElementById('templateRevertBtn');
const templateSaveStatusEl = document.getElementById('templateSaveStatus');

let templatesCatalog = [];
let selectedTemplateId = null;
let templateOriginal = null; // last-saved snapshot, used to detect dirty edits

function selectedTemplate() {
  return templatesCatalog.find((t) => t.id === selectedTemplateId) || null;
}

function renderTemplatesList() {
  templatesListEl.innerHTML = '';
  for (const t of templatesCatalog) {
    const li = document.createElement('li');
    if (t.id === selectedTemplateId) li.classList.add('active');
    const customizedDot = t.customized ? '<span class="customized" title="Customized"></span>' : '';
    li.innerHTML = `
      <div class="name">${customizedDot}<span class="label-text"></span></div>
      <div class="desc"></div>
    `;
    li.querySelector('.label-text').textContent = t.name;
    li.querySelector('.desc').textContent = t.description;
    li.addEventListener('click', () => openTemplate(t.id));
    templatesListEl.appendChild(li);
  }
}

function renderTemplateEditor() {
  const t = selectedTemplate();
  if (!t) {
    templateEditorEl.classList.add('hidden');
    templatesSelectMessageEl.classList.remove('hidden');
    return;
  }
  templateEditorEl.classList.remove('hidden');
  templatesSelectMessageEl.classList.add('hidden');
  if (document.activeElement !== templateNameEl)         templateNameEl.value = t.name;
  if (document.activeElement !== templateDescriptionEl)  templateDescriptionEl.value = t.description;
  if (!templateInstructionsEditor.hasFocus()) templateInstructionsEditor.setValue(t.instructions);
  templateRevertBtn.hidden = !t.customized;
}

function isTemplateDirty() {
  if (!templateOriginal) return false;
  return (
    templateNameEl.value !== templateOriginal.name ||
    templateDescriptionEl.value !== templateOriginal.description ||
    templateInstructionsEditor.getValue() !== templateOriginal.instructions
  );
}

async function openTemplate(id) {
  // Guard against losing edits if the user clicks another template mid-edit.
  if (templateOriginal && isTemplateDirty()) {
    if (!confirm('You have unsaved changes to this template. Discard them?')) return;
  }
  selectedTemplateId = id;
  const t = selectedTemplate();
  templateOriginal = t ? { name: t.name, description: t.description, instructions: t.instructions } : null;
  renderTemplatesList();
  renderTemplateEditor();
}

async function reloadTemplates() {
  templatesCatalog = await window.wisper.templatesList();
  if (!selectedTemplateId && templatesCatalog.length) {
    selectedTemplateId = templatesCatalog[0].id;
    const t = selectedTemplate();
    templateOriginal = t ? { name: t.name, description: t.description, instructions: t.instructions } : null;
  }
  renderTemplatesList();
  renderTemplateEditor();
}

templateSaveBtn.addEventListener('click', async () => {
  const t = selectedTemplate();
  if (!t) return;
  const updated = await window.wisper.templatesSave({
    id: t.id,
    name: templateNameEl.value.trim() || t.name,
    description: templateDescriptionEl.value.trim(),
    instructions: templateInstructionsEditor.getValue(),
  });
  // Refresh the in-memory catalog so the customized-dot updates.
  templatesCatalog = templatesCatalog.map((x) => (x.id === updated.id ? updated : x));
  templateOriginal = { name: updated.name, description: updated.description, instructions: updated.instructions };
  renderTemplatesList();
  renderTemplateEditor();
  templateSaveStatusEl.textContent = 'Saved';
  templateSaveStatusEl.style.color = '#30d158';
  setTimeout(() => { templateSaveStatusEl.textContent = ''; templateSaveStatusEl.style.color = ''; }, 1500);
});

// ----- Meetings tab — Calendar feed + meetings list -----
const calendarListEl = document.getElementById('calendarList');
const calendarEmptyEl = document.getElementById('calendarEmpty');
const meetingsListEl = document.getElementById('meetingsList');
const meetingsEmptyEl = document.getElementById('meetingsEmpty');
const manageFeedsBtn = document.getElementById('manageFeedsBtn');
const refreshCalendarBtn = document.getElementById('refreshCalendarBtn');
const feedsDialogEl = document.getElementById('feedsDialog');
const feedsDialogCloseBtn = document.getElementById('feedsDialogClose');
const feedsListEl = document.getElementById('feedsList');
const feedNewUrlEl = document.getElementById('feedNewUrl');
const feedNewLabelEl = document.getElementById('feedNewLabel');
const feedAddBtn = document.getElementById('feedAddBtn');

let calendarSnapshot = { feeds: [], events: [] };

function eventTimingClass(ev) {
  const now = Date.now();
  const start = new Date(ev.start).getTime();
  const end = new Date(ev.end).getTime();
  if (now >= start && now < end) return 'happening';
  if (start - now <= 15 * 60 * 1000 && start > now) return 'soon';
  return '';
}

function fmtEventTime(ev) {
  const s = new Date(ev.start);
  const e = new Date(ev.end);
  const sameDay = s.toDateString() === e.toDateString();
  const opts = { hour: '2-digit', minute: '2-digit' };
  if (ev.isAllDay) return 'All day';
  if (sameDay) return `${s.toLocaleTimeString(undefined, opts)} – ${e.toLocaleTimeString(undefined, opts)}`;
  return s.toLocaleString(undefined, { month: 'short', day: 'numeric', ...opts });
}

function renderCalendar() {
  calendarListEl.innerHTML = '';
  const upcoming = calendarSnapshot.events.filter((e) => new Date(e.end).getTime() > Date.now()).slice(0, 6);
  for (const ev of upcoming) {
    const li = document.createElement('li');
    const cls = eventTimingClass(ev);
    if (cls) li.classList.add(cls);
    if (ev.color) li.style.borderLeftColor = ev.color;
    li.innerHTML = `
      <div class="when"></div>
      <div class="title"></div>
      ${ev.location ? '<div class="where"></div>' : ''}
    `;
    li.querySelector('.when').textContent = fmtEventTime(ev);
    li.querySelector('.title').textContent = ev.title;
    if (ev.location) li.querySelector('.where').textContent = ev.location;
    calendarListEl.appendChild(li);
  }
  calendarEmptyEl.style.display = (calendarSnapshot.feeds.length === 0) ? 'block' : 'none';
}

// Calendar-store ERR_ codes → localised guidance. Unrecognised errors (raw
// HTTP statuses, network failures) pass through unchanged.
function feedErrorMessage(raw) {
  const text = String(raw || '');
  if (text.includes('ERR_GOOGLE_EMBED_URL')) return window.i18n.t('This is Google Calendar’s browser page, not an ICS feed. In Google Calendar settings, copy the “Secret address in iCal format” instead.');
  if (text.includes('ERR_GOOGLE_NOT_PUBLIC')) {
    // The native Calendar integration only exists on macOS; don't send
    // Windows/Linux users looking for it.
    return window.__lastSettings?.platform === 'darwin'
      ? window.i18n.t('This Google calendar is not public. Copy the “Secret address in iCal format” from its settings, or use the macOS Calendar integration if your organisation disables it.')
      : window.i18n.t('This Google calendar is not public. Copy the “Secret address in iCal format” from its settings.');
  }
  if (text.includes('ERR_FEED_AUTH_REQUIRED')) return window.i18n.t('This feed requires sign-in. Use a private or secret ICS address instead.');
  if (text.includes('ERR_NOT_ICS')) return window.i18n.t('The URL returned a web page, not calendar data. Check that the address is an ICS feed.');
  // Validation errors from normalizeFeedUrl arrive wrapped by the IPC layer;
  // match on the exact source text so they localise too.
  if (text.includes('Calendar feed URL is invalid.')) return window.i18n.t('Calendar feed URL is invalid.');
  if (text.includes('Calendar feeds must use HTTPS.')) return window.i18n.t('Calendar feeds must use HTTPS.');
  if (text.includes('Calendar feed URLs cannot contain embedded credentials.')) return window.i18n.t('Calendar feed URLs cannot contain embedded credentials.');
  return text;
}

function renderFeedsDialog() {
  feedsListEl.innerHTML = '';
  for (const f of calendarSnapshot.feeds) {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="swatch" style="background:${f.color || '#0a84ff'}"></div>
      <div class="info">
        <div class="label"></div>
        <div class="url"></div>
        ${f.lastError ? '<div class="err"></div>' : ''}
      </div>
      <button class="text-button danger" data-action="remove">Remove</button>
    `;
    li.querySelector('.label').textContent = f.label || '(unlabeled)';
    li.querySelector('.url').textContent = f.url;
    if (f.lastError) li.querySelector('.err').textContent = feedErrorMessage(f.lastError);
    li.querySelector('[data-action="remove"]').addEventListener('click', async () => {
      if (!confirm(`Remove feed "${f.label || f.url}"?`)) return;
      await window.wisper.calendarRemoveFeed(f.id);
    });
    feedsListEl.appendChild(li);
  }
}

manageFeedsBtn.addEventListener('click', () => {
  feedsDialogEl.classList.remove('hidden');
  renderFeedsDialog();
});
feedsDialogCloseBtn.addEventListener('click', () => feedsDialogEl.classList.add('hidden'));
feedsDialogEl.addEventListener('click', (e) => {
  if (e.target === feedsDialogEl) feedsDialogEl.classList.add('hidden');
});

feedAddBtn.addEventListener('click', async () => {
  const url = feedNewUrlEl.value.trim();
  if (!url) { alert('Paste an ICS URL first.'); return; }
  try {
    await window.wisper.calendarAddFeed({ url, label: feedNewLabelEl.value.trim() });
  } catch (e) {
    alert(window.i18n.t('Could not add calendar feed: {0}', { 0: feedErrorMessage(e.message || e) }));
    return;
  }
  feedNewUrlEl.value = '';
  feedNewLabelEl.value = '';
});

refreshCalendarBtn.addEventListener('click', async () => {
  refreshCalendarBtn.textContent = '…';
  await window.wisper.calendarRefresh();
  refreshCalendarBtn.textContent = '↻';
});

window.wisper.onCalendarChanged((snap) => {
  calendarSnapshot = snap;
  renderCalendar();
  if (!feedsDialogEl.classList.contains('hidden')) renderFeedsDialog();
});

// Re-fetch when the user switches to Meetings (cheap; throttled by node-ical
// network anyway).
document.querySelectorAll('.nav-item').forEach((b) => {
  b.addEventListener('click', () => {
    if (b.dataset.tab === 'meetings' && (calendarSnapshot.feeds.length > 0 || window.__lastSettings?.platform === 'darwin')) {
      window.wisper.calendarRefresh();
    }
  });
});

// ----- Meetings recording + detail pane -----
const startMeetingBtn = document.getElementById('startMeetingBtn');
const meetingDetailEl = document.getElementById('meetingDetail');
const meetingsSelectMessageEl = document.getElementById('meetingsSelectMessage');
const meetingTitleEl = document.getElementById('meetingTitle');
const meetingRecordingStatusEl = document.getElementById('meetingRecordingStatus');
const stopMeetingBtn = document.getElementById('stopMeetingBtn');
const transcribeMeetingBtn = document.getElementById('transcribeMeetingBtn');
const cancelTranscriptionBtn = document.getElementById('cancelTranscriptionBtn');
const aiNotesMeetingBtn = document.getElementById('aiNotesMeetingBtn');
const meetingTemplateSelect = document.getElementById('meetingTemplateSelect');
const deleteMeetingBtn = document.getElementById('deleteMeetingBtn');

// Inline template picker next to Generate: pick the template first, then
// generate — previously the choice was hidden behind a popup.
function populateMeetingTemplateSelect() {
  // Re-rendering must not clobber an in-progress user choice, but switching
  // to another meeting starts from that meeting's stored template.
  const sameMeeting = meetingTemplateSelect.dataset.meetingId === selectedMeeting?.id;
  const previous = sameMeeting ? meetingTemplateSelect.value : '';
  meetingTemplateSelect.dataset.meetingId = selectedMeeting?.id || '';
  meetingTemplateSelect.innerHTML = '';
  for (const t of templatesCatalog) {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    meetingTemplateSelect.appendChild(opt);
  }
  const preferred = previous || selectedMeeting?.aiTemplateId;
  if (preferred && templatesCatalog.some((t) => t.id === preferred)) meetingTemplateSelect.value = preferred;
}
const meetingUserNotesEl = document.getElementById('meetingUserNotes');
const meetingNotesEditor = window.CrunchyEditor.mount(meetingUserNotesEl, {
  stats: '#meetingNotesStats',
  label: 'Live meeting notes',
  placeholder: 'Type live notes here while you record. Autosaves.',
});
const meetingTranscriptEl = document.getElementById('meetingTranscript');
const meetingTranscriptEmptyEl = document.getElementById('meetingTranscriptEmpty');
const meetingAiNotesEl = document.getElementById('meetingAiNotes');
const meetingAiNotesEmptyEl = document.getElementById('meetingAiNotesEmpty');
const meetingAiNotesEmptyHtml = meetingAiNotesEmptyEl.innerHTML;
const meetingAiActionsEl = document.getElementById('meetingAiNotesActions');
const aiNotesCopyBtn = document.getElementById('aiNotesCopyBtn');
const aiNotesRegenBtn = document.getElementById('aiNotesRegenBtn');
const aiNotesSendBtn = document.getElementById('aiNotesSendBtn');

let meetingsList = [];
let selectedMeeting = null;
let activeMeetingId = null; // currently-recording meeting (if any)
let generatingNotesForMeetingId = null; // meeting with AI-note generation in flight
let mtgMediaStream = null;
let mtgAudioCtx = null;
let mtgProcessor = null;
let mtgNativeRate = 48_000;
let mtgSystemStream = null;
let mtgSystemAudioCtx = null;
let mtgSystemProcessor = null;
let mtgStartedAt = 0;
let mtgTimerHandle = null;
let mtgTitleSaveTimer = null;
let mtgNotesSaveTimer = null;
let mtgStartPending = false;
let mtgStopPending = false;

function fmtDuration(sec) {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function renderMeetingsList() {
  meetingsListEl.innerHTML = '';
  for (const m of meetingsList) {
    const li = document.createElement('li');
    if (m.id === selectedMeeting?.id) li.classList.add('active');
    if (m.id === activeMeetingId) li.classList.add('recording');
    const date = new Date(m.createdAt);
    const subtitle = m.id === activeMeetingId
      ? '● Recording…'
      : `${date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` +
        (m.durationSec ? ' · ' + fmtDuration(m.durationSec) : '');
    li.innerHTML = `<div class="title"></div><div class="meta"></div>`;
    li.querySelector('.title').textContent = m.title;
    li.querySelector('.meta').textContent = subtitle;
    li.addEventListener('click', () => openMeeting(m));
    li.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      showContextMenu(ev.clientX, ev.clientY, [
        { label: 'Reveal in folder', action: () => window.wisper.meetingsReveal(m.id) },
        { label: 'Delete meeting', danger: true, action: () => deleteMeeting(m) },
      ]);
    });
    meetingsListEl.appendChild(li);
  }
  meetingsEmptyEl.style.display = meetingsList.length === 0 ? 'block' : 'none';
}

function renderMeetingDetail() {
  if (!selectedMeeting) {
    meetingDetailEl.classList.add('hidden');
    meetingsSelectMessageEl.classList.remove('hidden');
    return;
  }
  meetingDetailEl.classList.remove('hidden');
  meetingsSelectMessageEl.classList.add('hidden');

  if (document.activeElement !== meetingTitleEl)
    meetingTitleEl.value = selectedMeeting.title;
  if (!meetingNotesEditor.hasFocus())
    meetingNotesEditor.setValue(selectedMeeting.userNotes || '');

  const isRecording = activeMeetingId === selectedMeeting.id;
  stopMeetingBtn.hidden = !isRecording;
  stopMeetingBtn.disabled = mtgStopPending;
  transcribeMeetingBtn.hidden = isRecording || (!selectedMeeting.hasMicAudio && !selectedMeeting.hasSystemAudio) || Boolean(selectedMeeting.transcript);
  aiNotesMeetingBtn.hidden = isRecording || !selectedMeeting.transcript;
  meetingTemplateSelect.hidden = aiNotesMeetingBtn.hidden && !selectedMeeting.aiNotes;
  populateMeetingTemplateSelect();
  // Generation state is rendered (not toggled imperatively) so switching
  // meetings mid-generation shows each meeting's own state.
  const generatingHere = generatingNotesForMeetingId === selectedMeeting.id;
  aiNotesMeetingBtn.disabled = generatingHere;
  aiNotesRegenBtn.disabled = generatingHere;
  meetingTemplateSelect.disabled = generatingHere;
  aiNotesMeetingBtn.textContent = generatingHere ? window.i18n.t('Generating…') : window.i18n.t('Generate');
  if (generatingHere) meetingAiNotesEmptyEl.textContent = window.i18n.t('Generating AI notes with the selected template…');
  else if (meetingAiNotesEmptyEl.innerHTML !== meetingAiNotesEmptyHtml) meetingAiNotesEmptyEl.innerHTML = meetingAiNotesEmptyHtml;
  deleteMeetingBtn.hidden = isRecording;

  if (isRecording) {
    meetingRecordingStatusEl.textContent = `Recording · ${fmtDuration((Date.now() - mtgStartedAt) / 1000)}`;
    meetingRecordingStatusEl.style.color = 'var(--danger)';
  } else if (selectedMeeting.durationSec) {
    meetingRecordingStatusEl.textContent = `Length · ${fmtDuration(selectedMeeting.durationSec)}`;
    meetingRecordingStatusEl.style.color = '';
  } else {
    meetingRecordingStatusEl.textContent = '';
  }

  if (selectedMeeting.transcript) {
    meetingTranscriptEl.classList.remove('hidden');
    meetingTranscriptEl.textContent = selectedMeeting.transcript;
    meetingTranscriptEmptyEl.style.display = 'none';
  } else {
    meetingTranscriptEl.classList.add('hidden');
    meetingTranscriptEmptyEl.style.display = '';
  }
  if (selectedMeeting.aiNotes) {
    meetingAiNotesEl.classList.remove('hidden');
    meetingAiNotesEl.textContent = selectedMeeting.aiNotes;
    meetingAiNotesEmptyEl.style.display = 'none';
    meetingAiActionsEl.hidden = false;
  } else {
    meetingAiNotesEl.classList.add('hidden');
    meetingAiNotesEmptyEl.style.display = '';
    meetingAiActionsEl.hidden = true;
  }
}

function renderMeetingsAll() {
  startMeetingBtn.disabled = Boolean(activeMeetingId || mtgStartPending);
  renderMeetingsList();
  renderMeetingDetail();
}

function openMeeting(m) {
  selectedMeeting = m ? { ...m } : null;
  renderMeetingsAll();
}

async function deleteMeeting(m) {
  if (!confirm(`Delete "${m.title}"? Audio + transcript + notes will be removed.`)) return;
  await window.wisper.meetingsDelete(m.id);
  if (selectedMeeting?.id === m.id) selectedMeeting = null;
}

async function startMeeting() {
  if (activeMeetingId || mtgStartPending) return;
  const supportsSystemAudio = ['darwin', 'win32'].includes(window.__lastSettings?.platform);
  const captureDescription = supportsSystemAudio
    ? 'CrunchyMurmur will record your microphone and system/call audio as separate tracks.'
    : 'CrunchyMurmur will record your microphone. System audio capture is unavailable on this platform.';
  if (!confirm(`Start a meeting recording?\n\n${captureDescription}\n\nYou are responsible for telling participants and obtaining any consent required by local law or policy.`)) return;
  mtgStartPending = true;
  startMeetingBtn.disabled = true;
  // Get the chosen mic up front so we fail fast if it's misconfigured.
  const cfg = window.__lastSettings || {};
  const constraints = window.microphoneDevices.withSelectedMicrophone({
    channelCount: 1,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  }, cfg.micDeviceId);

  let stream;
  let systemStream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
  } catch (e) {
    alert('Could not open the microphone. ' + (e.message || e));
    mtgStartPending = false;
    startMeetingBtn.disabled = false;
    return;
  }

  if (supportsSystemAudio) {
    try {
      systemStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      if (!systemStream.getAudioTracks().length) {
        systemStream.getTracks().forEach((track) => track.stop());
        systemStream = null;
        alert('System audio was not available from the selected source. The meeting will continue with microphone audio only.');
      }
    } catch (error) {
      console.warn('System audio capture was not granted:', error);
    }
  }

  let m;
  try {
    m = await window.wisper.meetingsBeginRecording();
  } catch (e) {
    stream.getTracks().forEach((track) => track.stop());
    systemStream?.getTracks().forEach((track) => track.stop());
    alert('Could not start the meeting. ' + (e.message || e));
    mtgStartPending = false;
    startMeetingBtn.disabled = false;
    return;
  }
  activeMeetingId = m.id;
  selectedMeeting = m;

  try {
    mtgMediaStream = stream;
    mtgAudioCtx = new AudioContext();
    mtgNativeRate = mtgAudioCtx.sampleRate;
    const source = mtgAudioCtx.createMediaStreamSource(mtgMediaStream);
    mtgProcessor = mtgAudioCtx.createScriptProcessor(4096, 1, 1);
    mtgProcessor.onaudioprocess = (ev) => {
      const ch = ev.inputBuffer.getChannelData(0);
      const ratio = mtgNativeRate / 16_000;
      const targetLen = Math.floor(ch.length / ratio);
      const out = new Float32Array(targetLen);
      for (let i = 0; i < targetLen; i++) {
        const srcIdx = i * ratio;
        const lo = Math.floor(srcIdx);
        const hi = Math.min(lo + 1, ch.length - 1);
        const frac = srcIdx - lo;
        out[i] = ch[lo] * (1 - frac) + ch[hi] * frac;
      }
      window.wisper.meetingsAppendAudio(m.id, out);
    };
    source.connect(mtgProcessor);
    mtgProcessor.connect(mtgAudioCtx.destination);
    if (systemStream) {
      await window.wisper.meetingsBeginSystemAudio(m.id);
      mtgSystemStream = systemStream;
      mtgSystemAudioCtx = new AudioContext();
      const systemRate = mtgSystemAudioCtx.sampleRate;
      const systemSource = mtgSystemAudioCtx.createMediaStreamSource(systemStream);
      mtgSystemProcessor = mtgSystemAudioCtx.createScriptProcessor(4096, 1, 1);
      mtgSystemProcessor.onaudioprocess = (ev) => {
        const ch = ev.inputBuffer.getChannelData(0);
        const ratio = systemRate / 16_000;
        const targetLen = Math.floor(ch.length / ratio);
        const out = new Float32Array(targetLen);
        for (let i = 0; i < targetLen; i++) {
          const srcIdx = i * ratio;
          const lo = Math.floor(srcIdx);
          const hi = Math.min(lo + 1, ch.length - 1);
          const frac = srcIdx - lo;
          out[i] = ch[lo] * (1 - frac) + ch[hi] * frac;
        }
        window.wisper.meetingsAppendSystemAudio(m.id, out);
      };
      systemSource.connect(mtgSystemProcessor);
      mtgSystemProcessor.connect(mtgSystemAudioCtx.destination);
    }
  } catch (e) {
    stream.getTracks().forEach((track) => track.stop());
    systemStream?.getTracks().forEach((track) => track.stop());
    await window.wisper.meetingsAbortRecording(m.id).catch(() => {});
    activeMeetingId = null;
    selectedMeeting = null;
    mtgStartPending = false;
    startMeetingBtn.disabled = false;
    alert('Could not initialize audio capture. ' + (e.message || e));
    return;
  }

  mtgStartedAt = Date.now();
  // Tick once a second so the running timer in the header updates without us
  // having to drive the whole render() loop on rAF.
  if (mtgTimerHandle) clearInterval(mtgTimerHandle);
  mtgTimerHandle = setInterval(() => {
    if (selectedMeeting && selectedMeeting.id === activeMeetingId) {
      meetingRecordingStatusEl.textContent = `Recording · ${fmtDuration((Date.now() - mtgStartedAt) / 1000)}`;
    }
  }, 1000);

  // Tell main to show the floating pill in meeting state.
  try { await window.wisper.meetingsPillStart({ id: m.id, startedAt: mtgStartedAt }); }
  catch (e) { console.warn('Meeting pill could not be shown:', e); }

  mtgStartPending = false;
  renderMeetingsAll();
}

async function stopMeeting() {
  if (!activeMeetingId || mtgStopPending) return;
  mtgStopPending = true;
  const meetingId = activeMeetingId;
  if (mtgTimerHandle) { clearInterval(mtgTimerHandle); mtgTimerHandle = null; }
  // Tear down the audio graph.
  if (mtgProcessor) { mtgProcessor.onaudioprocess = null; try { mtgProcessor.disconnect(); } catch {} mtgProcessor = null; }
  if (mtgAudioCtx)  { try { mtgAudioCtx.close(); }     catch {} mtgAudioCtx = null; }
  if (mtgMediaStream) {
    mtgMediaStream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
    mtgMediaStream = null;
  }
  if (mtgSystemProcessor) { mtgSystemProcessor.onaudioprocess = null; try { mtgSystemProcessor.disconnect(); } catch {} mtgSystemProcessor = null; }
  if (mtgSystemAudioCtx) { try { mtgSystemAudioCtx.close(); } catch {} mtgSystemAudioCtx = null; }
  if (mtgSystemStream) {
    mtgSystemStream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
    mtgSystemStream = null;
  }

  meetingRecordingStatusEl.textContent = 'Saving audio…';
  meetingRecordingStatusEl.style.color = '';
  try {
    selectedMeeting = await window.wisper.meetingsFinishRecording(meetingId);
    activeMeetingId = null;
  } catch (e) {
    await window.wisper.meetingsAbortRecording(meetingId).catch(() => {});
    activeMeetingId = null;
    alert('Could not finalize the meeting audio. ' + (e.message || e));
  }
  startMeetingBtn.disabled = false;
  mtgStopPending = false;

  // The store broadcast already refreshes the list; we just need to keep the
  // selection.
  selectedMeeting = await window.wisper.meetingsGet(meetingId);
  renderMeetingsAll();
}

// Stop request from the floating pill — user clicked the pill while a meeting
// was recording. Forward to the same stopMeeting() the in-app Stop button
// uses so the audio save + UI update path is identical.
window.wisper.onPillRequestStopMeeting(() => {
  if (activeMeetingId && !mtgStopPending) stopMeeting();
});
document.querySelectorAll('[data-app-menu]').forEach((button) => {
  button.addEventListener('click', () => window.wisper.openAppMenu(button.dataset.appMenu));
});

// AI notes action row — Copy / Re-generate / Send to Notes
aiNotesCopyBtn.addEventListener('click', async () => {
  if (!selectedMeeting?.aiNotes) return;
  await window.wisper.copyText(selectedMeeting.aiNotes);
  aiNotesCopyBtn.textContent = 'Copied';
  aiNotesCopyBtn.classList.add('copied');
  setTimeout(() => { aiNotesCopyBtn.textContent = 'Copy'; aiNotesCopyBtn.classList.remove('copied'); }, 1200);
});

aiNotesRegenBtn.addEventListener('click', () => {
  if (!selectedMeeting?.transcript) return;
  // Re-generates with whichever template is selected in the inline picker.
  generateMeetingAINotes();
});

aiNotesSendBtn.addEventListener('click', () => {
  if (!selectedMeeting?.aiNotes) return;
  openSendToNotesPopup(selectedMeeting.id);
});

// Folder-picker popover — pick a Notes folder, save the AI notes there.
function openSendToNotesPopup(meetingId) {
  const existing = document.getElementById('ai-note-popup');
  if (existing) existing.remove();

  const popup = document.createElement('div');
  popup.id = 'ai-note-popup';
  popup.className = 'ai-note-popup';
  popup.style.left = '50%';
  popup.style.top = '120px';
  popup.style.transform = 'translateX(-50%)';
  popup.innerHTML = `
    <div class="ai-pop-header">Send to Notes</div>
    <label class="ai-pop-label">Folder</label>
    <select id="sendToFolderSel"></select>
    <p class="ai-pop-hint">A new note will be created with the meeting title, your live notes, and the AI summary.</p>
    <div class="ai-pop-actions">
      <button class="text-button" id="sendToCancel">Cancel</button>
      <button class="primary-button" id="sendToConfirm">Send</button>
    </div>
    <div class="ai-pop-status" id="sendToStatus"></div>
  `;
  document.body.appendChild(popup);

  // Populate folders, default to "Meetings" if it exists.
  const sel = popup.querySelector('#sendToFolderSel');
  const folders = (notesSnapshot.folders || []);
  for (const f of folders) {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = f;
    sel.appendChild(opt);
  }
  if (folders.includes('Meetings')) sel.value = 'Meetings';
  else if (folders.includes('Inbox')) sel.value = 'Inbox';

  const close = () => popup.remove();
  popup.querySelector('#sendToCancel').addEventListener('click', close);
  popup.querySelector('#sendToConfirm').addEventListener('click', async () => {
    const status = popup.querySelector('#sendToStatus');
    const btn = popup.querySelector('#sendToConfirm');
    btn.disabled = true;
    status.textContent = 'Saving…';
    const r = await window.wisper.meetingsSendToNotes(meetingId, sel.value);
    if (!r.ok) {
      status.textContent = '';
      alert('Send failed: ' + r.error);
      btn.disabled = false;
      return;
    }
    status.textContent = 'Sent.';
    setTimeout(() => {
      close();
      switchTab('notes');
      if (r.note) {
        selectedFolder = r.note.folder;
        selectedNote = { ...r.note };
        renderNotesTab();
      }
    }, 500);
  });
}

async function transcribeMeeting() {
  if (!selectedMeeting) return;
  meetingRecordingStatusEl.textContent = 'Transcribing…';
  transcribeMeetingBtn.disabled = true;
  cancelTranscriptionBtn.hidden = false;
  cancelTranscriptionBtn.disabled = false;
  const r = await window.wisper.meetingsTranscribe(selectedMeeting.id);
  transcribeMeetingBtn.disabled = false;
  cancelTranscriptionBtn.hidden = true;
  if (!r.ok) {
    meetingRecordingStatusEl.textContent = '';
    alert('Transcription failed: ' + r.error);
    return;
  }
  selectedMeeting = r.meeting;
  meetingRecordingStatusEl.textContent = '';
  renderMeetingsAll();
}

cancelTranscriptionBtn.addEventListener('click', async () => {
  if (!selectedMeeting) return;
  cancelTranscriptionBtn.disabled = true;
  meetingRecordingStatusEl.textContent = 'Cancelling…';
  await window.wisper.meetingsCancelTranscription(selectedMeeting.id);
});

window.wisper.onMeetingTranscriptionProgress((progress) => {
  if (!selectedMeeting || progress.id !== selectedMeeting.id) return;
  const percent = Math.round((Number(progress.progress) || 0) * 100);
  meetingRecordingStatusEl.textContent = `${progress.stage} · ${percent}%`;
});

async function generateMeetingAINotes() {
  if (!selectedMeeting || generatingNotesForMeetingId) return;
  // The template comes from the inline picker next to Generate. The meeting
  // id is captured so a user switching meetings while generation is in
  // flight never has the stale result clobber the newly selected meeting.
  const meetingId = selectedMeeting.id;
  const templateId = meetingTemplateSelect.value;
  generatingNotesForMeetingId = meetingId;
  renderMeetingDetail();
  try {
    const r = await window.wisper.meetingsGenerateAINotes(meetingId, templateId);
    if (!r.ok) {
      alert(window.i18n.t('Generation failed: {0}', { 0: r.error }));
      return;
    }
    if (selectedMeeting?.id === meetingId) selectedMeeting = r.meeting;
  } finally {
    generatingNotesForMeetingId = null;
    renderMeetingsAll();
  }
}

startMeetingBtn.addEventListener('click', startMeeting);
stopMeetingBtn.addEventListener('click', stopMeeting);
transcribeMeetingBtn.addEventListener('click', transcribeMeeting);
aiNotesMeetingBtn.addEventListener('click', generateMeetingAINotes);
deleteMeetingBtn.addEventListener('click', () => { if (selectedMeeting) deleteMeeting(selectedMeeting); });

meetingTitleEl.addEventListener('input', () => {
  if (mtgTitleSaveTimer) clearTimeout(mtgTitleSaveTimer);
  mtgTitleSaveTimer = setTimeout(async () => {
    if (!selectedMeeting) return;
    const updated = await window.wisper.meetingsUpdate(selectedMeeting.id, { title: meetingTitleEl.value.trim() });
    selectedMeeting = updated;
  }, 400);
});
meetingUserNotesEl.addEventListener('input', () => {
  if (mtgNotesSaveTimer) clearTimeout(mtgNotesSaveTimer);
  mtgNotesSaveTimer = setTimeout(async () => {
    if (!selectedMeeting) return;
    const updated = await window.wisper.meetingsUpdate(selectedMeeting.id, { userNotes: meetingNotesEditor.getValue() });
    selectedMeeting = updated;
  }, 400);
});

window.wisper.onMeetingsChanged((list) => {
  meetingsList = list;
  if (selectedMeeting) {
    selectedMeeting = list.find((m) => m.id === selectedMeeting.id) || null;
  }
  renderMeetingsAll();
});

// ----- AI Notes generation popover (used from the Recordings tab) -----

function openAINotePopup(recordingId, x, y) {
  // Bail early if we have no provider configured. Otherwise the user clicks
  // Generate and gets a generic "missing key" error — friendlier to nudge
  // them to Settings up front.
  const cfg = window.__lastSettings || {};
  const provider = cfg.aiNotesProvider || 'anthropic';
  // Hosted providers need an API key. Claude Code / Codex just need the
  // CLI on disk (validated at generate time — we don't pre-check here, the
  // error path on missing CLI is friendly enough).
  const needsKey = ['anthropic', 'openai', 'groq'].includes(provider);
  const keyOk = !needsKey ||
    (provider === 'anthropic' && cfg.anthropicApiKey) ||
    (provider === 'openai' && cfg.openaiApiKey) ||
    (provider === 'groq' && cfg.groqApiKey);
  if (!keyOk) {
    if (confirm(window.i18n.t('No API key on file for the AI Notes provider. Open AI notes settings to add one?'))) {
      switchTab('engine', 'ai-notes');
    }
    return;
  }

  // Lightweight popover near the click point.
  const existing = document.getElementById('ai-note-popup');
  if (existing) existing.remove();

  const popup = document.createElement('div');
  popup.id = 'ai-note-popup';
  popup.className = 'ai-note-popup';
  popup.innerHTML = `
    <div class="ai-pop-header">Generate AI note</div>
    <label class="ai-pop-label">Template</label>
    <select id="aiPopTemplate"></select>
    <p class="ai-pop-hint" id="aiPopProviderHint"></p>
    <div class="ai-pop-actions">
      <button class="text-button" id="aiPopCancel">Cancel</button>
      <button class="primary-button" id="aiPopGenerate">Generate</button>
    </div>
    <div class="ai-pop-status" id="aiPopStatus"></div>
  `;
  popup.style.left = x + 'px';
  popup.style.top = y + 'px';
  document.body.appendChild(popup);

  const rect = popup.getBoundingClientRect();
  if (rect.right > window.innerWidth) popup.style.left = (window.innerWidth - rect.width - 12) + 'px';
  if (rect.bottom > window.innerHeight) popup.style.top = (window.innerHeight - rect.height - 12) + 'px';

  const sel = popup.querySelector('#aiPopTemplate');
  for (const t of templatesCatalog) {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    sel.appendChild(opt);
  }
  const providerLabel = {
    anthropic: `Anthropic · ${cfg.anthropicModel || 'default'}`,
    openai: `OpenAI · ${cfg.openaiModel || 'default'}`,
    groq: `Groq · ${cfg.groqNotesModel || 'default'}`,
    claudeCode: 'Claude Code (your subscription)',
    codex: 'Codex (your subscription)',
  }[provider] || provider;
  popup.querySelector('#aiPopProviderHint').textContent = `Using ${providerLabel}.`;

  const close = () => { popup.remove(); document.removeEventListener('mousedown', dismiss); document.removeEventListener('keydown', escDismiss); };
  const dismiss = (ev) => { if (!popup.contains(ev.target)) close(); };
  const escDismiss = (ev) => { if (ev.key === 'Escape') close(); };
  setTimeout(() => {
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('keydown', escDismiss);
  }, 0);

  popup.querySelector('#aiPopCancel').addEventListener('click', close);
  popup.querySelector('#aiPopGenerate').addEventListener('click', async () => {
    const templateId = sel.value;
    const statusEl = popup.querySelector('#aiPopStatus');
    statusEl.textContent = 'Generating…';
    popup.querySelector('#aiPopGenerate').disabled = true;
    popup.querySelector('#aiPopCancel').disabled = true;

    const r = await window.wisper.aiNotesGenerateFromRecording({ recordingId, templateId });
    if (!r.ok) {
      statusEl.textContent = '';
      alert('Generation failed: ' + r.error);
      popup.querySelector('#aiPopGenerate').disabled = false;
      popup.querySelector('#aiPopCancel').disabled = false;
      return;
    }
    statusEl.textContent = 'Saved to Notes / Inbox.';
    setTimeout(() => {
      close();
      switchTab('notes');
      // Open the newly created note.
      if (r.note) {
        selectedFolder = r.note.folder;
        selectedNote = { ...r.note };
        renderNotesTab();
      }
    }, 600);
  });
}

templateRevertBtn.addEventListener('click', async () => {
  const t = selectedTemplate();
  if (!t) return;
  if (!confirm(`Revert "${t.name}" to the bundled default? Your edits will be lost.`)) return;
  const reverted = await window.wisper.templatesRevert(t.id);
  templatesCatalog = templatesCatalog.map((x) => (x.id === reverted.id ? reverted : x));
  templateOriginal = { name: reverted.name, description: reverted.description, instructions: reverted.instructions };
  renderTemplatesList();
  renderTemplateEditor();
  templateSaveStatusEl.textContent = 'Reverted';
  templateSaveStatusEl.style.color = 'var(--text-muted)';
  setTimeout(() => { templateSaveStatusEl.textContent = ''; templateSaveStatusEl.style.color = ''; }, 1500);
});

// Settings
const whisperCliPathEl = document.getElementById('whisperCliPath');
const parakeetModelPathEl = document.getElementById('parakeetModelPath');
const modelPathEl = document.getElementById('modelPath');
const installedModelPickerEl = document.getElementById('installedModelPicker');
const groqApiKeyEl = document.getElementById('groqApiKey');
const groqModelEl = document.getElementById('groqModel');
const languageEl = document.getElementById('language');
const languageHintEl = document.getElementById('languageHint');
const uiLocaleEl = document.getElementById('uiLocale');
const micDeviceEl = document.getElementById('micDeviceId');
const testMicBtn = document.getElementById('testMic');
const micTestMeterEl = document.getElementById('micTestMeter');
const micHintEl = document.getElementById('micHint');
const hotkeyEl = document.getElementById('hotkey');
const hotkeyDisplayEl = document.getElementById('hotkeyDisplay');
const recordHotkeyBtn = document.getElementById('recordHotkey');
const hotkeyHintEl = document.getElementById('hotkeyHint');
const useFnHotkeyBtn = document.getElementById('useFnHotkey');
const themeInputs = [...document.querySelectorAll('input[name="theme"]')];
const themeHintEl = document.getElementById('themeHint');
const autoUpdateEl = document.getElementById('autoUpdate');
const updateChannelEl = document.getElementById('updateChannel');
const audioRetentionPolicyEl = document.getElementById('audioRetentionPolicy');
const aiFormatEnabledEl = document.getElementById('aiFormatEnabled');
const groqFormatModelEl = document.getElementById('groqFormatModel');
const aiFormatFallbackEl = document.getElementById('aiFormatFallback');
const aiFormatSystemPromptEl = document.getElementById('aiFormatSystemPrompt');
const updateStatusEl = document.getElementById('updateStatus');
const saveEngineBtn = document.getElementById('saveEngine');
const engineSaveStatusEl = document.getElementById('engineSaveStatus');
// One Save action persists all general settings; each settings section that
// contains general controls has its own Save button + status span, so status
// is mirrored to all of them.
const saveGeneralBtns = Array.from(document.querySelectorAll('.save-general'));
const generalStatusSpans = Array.from(document.querySelectorAll('.general-save-status'));
let generalStatusTimer = null;
function setGeneralStatus(text, { error = false, clearAfterMs = 0 } = {}) {
  if (generalStatusTimer) { clearTimeout(generalStatusTimer); generalStatusTimer = null; }
  for (const span of generalStatusSpans) {
    span.style.color = error ? 'var(--danger)' : '';
    span.textContent = text;
  }
  if (clearAfterMs) generalStatusTimer = setTimeout(() => setGeneralStatus(''), clearAfterMs);
}
const engineLocalEl = document.getElementById('engineLocal');
const engineParakeetEl = document.getElementById('engineParakeet');
const engineGroqEl = document.getElementById('engineGroq');
const parakeetReadinessEl = document.getElementById('parakeetReadiness');
const cliReadinessEl = document.getElementById('cliReadiness');
const modelReadinessEl = document.getElementById('modelReadiness');
const localBackendReadinessEl = document.getElementById('localBackendReadiness');
const cliSetupGuideEl = document.getElementById('cliSetupGuide');

const systemDarkMode = window.matchMedia('(prefers-color-scheme: dark)');
function selectedTheme() {
  return document.querySelector('input[name="theme"]:checked')?.value || 'system';
}
function updateThemeHint() {
  const preference = selectedTheme();
  const effective = preference === 'system'
    ? (systemDarkMode.matches ? 'Dark' : 'Light')
    : (preference === 'dark' ? 'Dark' : 'Light');
  themeHintEl.textContent = preference === 'system'
    ? `Following ${window.__lastSettings?.platform === 'darwin' ? 'macOS' : window.__lastSettings?.platform === 'linux' ? 'Linux' : 'Windows'} · ${effective} mode is active.`
    : `${effective} mode is selected. Choose System to follow operating-system changes automatically.`;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.effectiveTheme = effective.toLowerCase();
  window.dispatchEvent(new CustomEvent('crunchy-theme-change', { detail: { dark: effective === 'Dark' } }));
}
systemDarkMode.addEventListener('change', updateThemeHint);
themeInputs.forEach((input) => {
  input.addEventListener('change', async () => {
    if (!input.checked) return;
    try {
      const cfg = await window.wisper.saveSettings({ theme: input.value });
      window.__lastSettings = cfg;
      updateThemeHint();
    } catch (error) {
      setGeneralStatus(error.message || String(error), { error: true });
    }
  });
});

async function populateInstalledPicker() {
  const installed = await window.wisper.modelsInstalled();
  const current = modelPathEl.value;
  installedModelPickerEl.innerHTML = '<option value="">— Pick from your downloads —</option>';
  const whisperModels = installed.filter((model) => model.family !== 'parakeet');
  for (const m of whisperModels) {
    const opt = document.createElement('option');
    opt.value = m.path;
    opt.textContent = `${m.name} (${formatBytes(m.bytes)})`;
    installedModelPickerEl.appendChild(opt);
  }
  // Reflect the current path in the dropdown if it points at one of the
  // downloaded models, otherwise leave the picker on the placeholder.
  if (current && whisperModels.some((m) => m.path === current)) {
    installedModelPickerEl.value = current;
  } else {
    installedModelPickerEl.value = '';
  }
}

installedModelPickerEl?.addEventListener('change', () => {
  if (installedModelPickerEl.value) {
    modelPathEl.value = installedModelPickerEl.value;
    void refreshModelReadiness();
  }
});

// Microphone picker
async function populateMicDevices(selectedId) {
  // Labels are only populated after mic permission has been granted at least
  // once. If we got back unlabeled devices, prompt for permission then re-list.
  let devices = await navigator.mediaDevices.enumerateDevices();
  let inputs = window.microphoneDevices.selectableMicrophones(devices);
  const anyLabeled = inputs.some((d) => d.label);

  if (!anyLabeled && inputs.length) {
    try {
      const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
      tmp.getTracks().forEach((t) => t.stop());
      devices = await navigator.mediaDevices.enumerateDevices();
      inputs = window.microphoneDevices.selectableMicrophones(devices);
    } catch {
      // Permission denied; we'll just show a generic list.
    }
  }

  // Rebuild options, preserving the always-present "Default" option at top.
  micDeviceEl.innerHTML = '<option value="">Default microphone (system)</option>';
  for (const d of inputs) {
    const opt = document.createElement('option');
    opt.value = d.deviceId;
    opt.textContent = d.label || `Microphone (${d.deviceId.slice(0, 6)}…)`;
    micDeviceEl.appendChild(opt);
  }

  // Restore selection if it's still in the list; otherwise reset to default
  // and warn the user that the saved device isn't available.
  if (selectedId && inputs.some((d) => d.deviceId === selectedId)) {
    micDeviceEl.value = selectedId;
  } else {
    micDeviceEl.value = '';
    if (selectedId) {
      micHintEl.textContent = 'Saved microphone is not available. Falling back to default.';
      micHintEl.style.color = 'var(--danger)';
    }
  }
}

// Refresh device list when devices are plugged/unplugged.
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
  navigator.mediaDevices.addEventListener('devicechange', () => {
    populateMicDevices(micDeviceEl.value);
  });
}

// Live mic-level test
const micTestBars = micTestMeterEl ? Array.from(micTestMeterEl.querySelectorAll('.bar')) : [];
let micTestStream = null;
let micTestCtx = null;
let micTestAnalyser = null;
let micTestRaf = null;
let micTestTimeout = null;

function stopMicTest() {
  if (micTestRaf) cancelAnimationFrame(micTestRaf);
  micTestRaf = null;
  if (micTestTimeout) clearTimeout(micTestTimeout);
  micTestTimeout = null;
  if (micTestAnalyser) { try { micTestAnalyser.disconnect(); } catch {} micTestAnalyser = null; }
  if (micTestCtx)      { try { micTestCtx.close(); }            catch {} micTestCtx = null; }
  if (micTestStream)   {
    micTestStream.getTracks().forEach((t) => { try { t.stop(); } catch {} });
    micTestStream = null;
  }
  micTestMeterEl.classList.remove('active');
  micTestBars.forEach((b) => { b.style.height = '4px'; b.style.opacity = '0.4'; });
  testMicBtn.textContent = 'Test';
}

async function startMicTest() {
  testMicBtn.textContent = 'Stop';
  micTestMeterEl.classList.add('active');
  const constraints = window.microphoneDevices.withSelectedMicrophone({
    channelCount: 1,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  }, micDeviceEl.value);

  try {
    micTestStream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
  } catch (e) {
    micHintEl.textContent = 'Could not open the selected mic: ' + (e.message || e);
    micHintEl.style.color = 'var(--danger)';
    stopMicTest();
    return;
  }

  micTestCtx = new AudioContext();
  const src = micTestCtx.createMediaStreamSource(micTestStream);
  micTestAnalyser = micTestCtx.createAnalyser();
  micTestAnalyser.fftSize = 512;
  src.connect(micTestAnalyser);

  const buf = new Uint8Array(micTestAnalyser.frequencyBinCount);
  const tick = () => {
    micTestAnalyser.getByteTimeDomainData(buf);
    let peak = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = Math.abs(buf[i] - 128) / 128;
      if (v > peak) peak = v;
    }
    micTestBars.forEach((bar, i) => {
      const threshold = (i + 1) / micTestBars.length;
      const intensity = Math.max(0, Math.min(1, peak / threshold));
      bar.style.height = (4 + intensity * 14) + 'px';
      bar.style.opacity = String(0.4 + intensity * 0.6);
    });
    micTestRaf = requestAnimationFrame(tick);
  };
  micTestRaf = requestAnimationFrame(tick);

  // Auto-stop after 8 s so we never leave the mic open.
  micTestTimeout = setTimeout(stopMicTest, 8000);
}

testMicBtn.addEventListener('click', () => {
  if (micTestStream) stopMicTest();
  else startMicTest();
});

// Stop the mic test if the user navigates away from Settings.
document.querySelectorAll('.nav-item').forEach((b) => {
  b.addEventListener('click', () => { if (micTestStream) stopMicTest(); });
});

function applyEngineKind(kind) {
  const k = ['parakeet', 'local', 'groq'].includes(kind) ? kind : 'parakeet';
  engineParakeetEl.classList.toggle('active', k === 'parakeet');
  engineLocalEl.classList.toggle('active', k === 'local');
  engineGroqEl.classList.toggle('active', k === 'groq');
  document.querySelectorAll('input[name="engineKind"]').forEach((r) => {
    r.checked = r.value === k;
  });
  if (k === 'local') void refreshLocalReadiness();
  if (k === 'parakeet') void refreshParakeetReadiness();
  updateLanguageHint(k);
}

function updateLanguageHint(engineKind = document.querySelector('input[name="engineKind"]:checked')?.value) {
  languageHintEl.textContent = engineKind === 'parakeet'
    ? window.i18n.t('Parakeet detects language automatically. Choose Whisper for Turkish, Arabic, Hindi, Japanese, Korean, Chinese, Norwegian, and other unsupported languages.')
    : window.i18n.t('Forces detection to a single language. Speeds up Whisper on short clips and avoids language mis-detection.');
}

languageEl.addEventListener('change', () => updateLanguageHint());

function setReadiness(el, ready, message) {
  el.textContent = `${ready ? '✓' : '○'} ${message}`;
  el.classList.toggle('ready', ready);
  el.classList.toggle('incomplete', !ready);
}

let localReadinessRequest = 0;
let modelReadinessRequest = 0;

async function refreshParakeetReadiness() {
  setReadiness(parakeetReadinessEl, false, window.i18n.t('Checking the bundled local engine...'));
  const result = await window.wisper.nativeEngineStatus(parakeetModelPathEl.value.trim());
  if (!result.available) {
    setReadiness(parakeetReadinessEl, false, window.i18n.t('The bundled local transcription engine is missing.'));
  } else if (!result.model.valid) {
    setReadiness(parakeetReadinessEl, false, result.model.reason);
  } else if (result.ready) {
    setReadiness(parakeetReadinessEl, true, window.i18n.t('Parakeet V3 is loaded and ready.'));
  } else {
    setReadiness(parakeetReadinessEl, true, window.i18n.t('Parakeet V3 is ready and will load with your next recording.'));
  }
  return result;
}

async function refreshModelReadiness() {
  const request = ++modelReadinessRequest;
  const result = await window.wisper.localModelStatus(modelPathEl.value.trim());
  if (request !== modelReadinessRequest) return result;
  setReadiness(modelReadinessEl, result.valid, result.valid ? 'GGML model is ready.' : result.reason);
  return result;
}

async function refreshLocalReadiness({ discover = true } = {}) {
  const request = ++localReadinessRequest;
  const preferredPath = whisperCliPathEl.value.trim();
  setReadiness(cliReadinessEl, false, window.i18n.t('Checking bundled whisper.cpp...'));
  setReadiness(localBackendReadinessEl, false, window.i18n.t('Checking local acceleration...'));
  const [result, model] = await Promise.all([
    window.wisper.whisperCliStatus(discover ? preferredPath : ''),
    refreshModelReadiness(),
  ]);
  if (request !== localReadinessRequest) return { cli: result, model };
  if (result.valid) {
    if (result.discovered) whisperCliPathEl.value = result.path;
    setReadiness(cliReadinessEl, true, result.bundled
      ? window.i18n.t('Bundled whisper.cpp is ready.')
      : `${window.i18n.t(result.discovered ? 'Found' : 'Ready')}: ${result.path}${result.version ? ` (${result.version})` : ''}`);
    const backend = await window.wisper.localEngineStatus(result.path, modelPathEl.value.trim());
    if (request !== localReadinessRequest) return { cli: result, model, backend };
    if (backend.ready) {
      setReadiness(localBackendReadinessEl, true, window.i18n.t('Persistent acceleration is active. The model stays loaded between transcriptions.'));
    } else if (backend.available) {
      setReadiness(localBackendReadinessEl, true, window.i18n.t('Persistent acceleration is available and will start with your next recording.'));
    } else {
      setReadiness(localBackendReadinessEl, false, window.i18n.t('Persistent acceleration is unavailable. Transcription still works, but the model reloads for each recording.'));
    }
  } else {
    setReadiness(cliReadinessEl, false, window.i18n.t('whisper-cli is required before local transcription can run.'));
    setReadiness(localBackendReadinessEl, false, window.i18n.t('Persistent acceleration is unavailable. Transcription still works, but the model reloads for each recording.'));
  }
  return { cli: result, model };
}

document.getElementById('showCliSetup').addEventListener('click', () => {
  cliSetupGuideEl.hidden = !cliSetupGuideEl.hidden;
  cliSetupGuideEl.textContent = window.i18n.t('CrunchyMurmur includes whisper.cpp. Use Browse only to override the bundled runtime with another compatible build.');
});
document.getElementById('refreshCli').addEventListener('click', () => void refreshLocalReadiness());
modelPathEl.addEventListener('input', () => void refreshModelReadiness());

document.querySelectorAll('input[name="engineKind"]').forEach((r) => {
  r.addEventListener('change', (e) => applyEngineKind(e.target.value));
});

document.getElementById('pickCli').addEventListener('click', async () => {
  const platform = window.__lastSettings?.platform;
  const filters = platform === 'win32' ? [{ name: 'Executables', extensions: ['exe'] }] : [{ name: 'Executable', extensions: ['*'] }];
  const p = await window.wisper.pickFile(filters);
  if (p) {
    whisperCliPathEl.value = p;
    await refreshLocalReadiness();
  }
});
document.getElementById('pickModel').addEventListener('click', async () => {
  const p = await window.wisper.pickFile([{ name: 'GGML model', extensions: ['bin'] }]);
  if (p) {
    modelPathEl.value = p;
    await refreshModelReadiness();
  }
});

saveEngineBtn.addEventListener('click', async () => {
  const engineKind = document.querySelector('input[name="engineKind"]:checked')?.value || 'parakeet';
  try {
    if (engineKind === 'local') await refreshLocalReadiness();
    if (engineKind === 'parakeet') await refreshParakeetReadiness();
    const cfg = await window.wisper.saveSettings({
      engineKind,
      parakeetModelPath: parakeetModelPathEl.value.trim(),
      whisperCliPath: whisperCliPathEl.value.trim(),
      modelPath: modelPathEl.value.trim(),
      groqApiKey: groqApiKeyEl.value.trim(),
      groqModel: groqModelEl.value,
    });
    window.__lastSettings = cfg;
    engineSaveStatusEl.style.color = '';
    engineSaveStatusEl.textContent = 'Saved.';
    setTimeout(() => { engineSaveStatusEl.textContent = ''; }, 1500);
  } catch (error) {
    engineSaveStatusEl.style.color = 'var(--danger)';
    engineSaveStatusEl.textContent = error.message || String(error);
  }
});

// AI Notes provider config
const aiAnthropicEl = document.getElementById('aiAnthropic');
const aiOpenaiEl = document.getElementById('aiOpenai');
const aiGroqEl = document.getElementById('aiGroq');
const anthropicApiKeyEl = document.getElementById('anthropicApiKey');
const anthropicModelEl = document.getElementById('anthropicModel');
const openaiApiKeyEl = document.getElementById('openaiApiKey');
const openaiModelEl = document.getElementById('openaiModel');
const groqNotesModelEl = document.getElementById('groqNotesModel');
const claudeCodeModelEl = document.getElementById('claudeCodeModel');
const claudeCodeEffortEl = document.getElementById('claudeCodeEffort');
const codexModelEl = document.getElementById('codexModel');
const codexReasoningEffortEl = document.getElementById('codexReasoningEffort');
const aiNotesEffectiveConfigEl = document.getElementById('aiNotesEffectiveConfig');
const saveAiNotesBtn = document.getElementById('saveAiNotes');
const aiNotesSaveStatusEl = document.getElementById('aiNotesSaveStatus');
let aiNotesProviderCatalog = [];

function effortLabel(effort) {
  const labels = {
    minimal: window.i18n.t('Minimal — fastest supported reasoning'),
    low: window.i18n.t('Low — fastest, lowest subscription usage'),
    medium: window.i18n.t('Medium — recommended for summaries'),
    high: window.i18n.t('High — better for complex transcripts'),
    xhigh: window.i18n.t('Extra high — slowest, highest subscription usage'),
    max: window.i18n.t('Maximum — highest reasoning depth'),
    ultra: window.i18n.t('Ultra — maximum reasoning with delegation'),
  };
  return labels[effort] || effort;
}

function populateCodexEfforts(preferred = '') {
  const provider = aiNotesProviderCatalog.find(value => value.id === 'codex');
  const model = provider?.models?.find(value => value.id === codexModelEl.value);
  const efforts = model?.efforts?.length ? model.efforts : provider?.efforts || ['low', 'medium', 'high'];
  codexReasoningEffortEl.innerHTML = '';
  for (const effort of efforts) {
    const option = document.createElement('option');
    option.value = effort;
    option.textContent = effortLabel(effort);
    codexReasoningEffortEl.appendChild(option);
  }
  const target = preferred || model?.defaultEffort || 'medium';
  codexReasoningEffortEl.value = efforts.includes(target) ? target : efforts[0];
}

function applyAiNotesProvider(kind) {
  const valid = ['anthropic', 'openai', 'groq', 'claudeCode', 'codex'];
  const k = valid.includes(kind) ? kind : 'anthropic';
  aiAnthropicEl.classList.toggle('active', k === 'anthropic');
  aiOpenaiEl.classList.toggle('active', k === 'openai');
  aiGroqEl.classList.toggle('active', k === 'groq');
  document.getElementById('aiClaudeCode').classList.toggle('active', k === 'claudeCode');
  document.getElementById('aiCodex').classList.toggle('active', k === 'codex');
  document.querySelectorAll('input[name="aiNotesProvider"]').forEach((r) => {
    r.checked = r.value === k;
  });
  renderAiNotesEffectiveConfig();
}

function renderAiNotesEffectiveConfig() {
  const provider = document.querySelector('input[name="aiNotesProvider"]:checked')?.value || 'anthropic';
  const configs = {
    anthropic: `Anthropic · ${anthropicModelEl.value}`,
    openai: `OpenAI · ${openaiModelEl.value}`,
    groq: `Groq · ${groqNotesModelEl.value}`,
    claudeCode: `Claude Code · ${claudeCodeModelEl.selectedOptions[0]?.textContent} · ${claudeCodeEffortEl.selectedOptions[0]?.textContent}`,
    codex: `Codex · ${codexModelEl.selectedOptions[0]?.textContent} · ${codexReasoningEffortEl.selectedOptions[0]?.textContent}`,
  };
  aiNotesEffectiveConfigEl.textContent = window.i18n.t('Effective configuration: {0}', { 0: configs[provider] });
}
document.querySelectorAll('input[name="aiNotesProvider"]').forEach((r) => {
  r.addEventListener('change', (e) => applyAiNotesProvider(e.target.value));
});
[anthropicModelEl, openaiModelEl, groqNotesModelEl, claudeCodeModelEl, claudeCodeEffortEl, codexModelEl, codexReasoningEffortEl]
  .forEach((el) => el.addEventListener('input', renderAiNotesEffectiveConfig));
codexModelEl.addEventListener('change', () => {
  populateCodexEfforts();
  renderAiNotesEffectiveConfig();
});

async function populateAiNotesModels() {
  const providers = await window.wisper.aiNotesProviders();
  aiNotesProviderCatalog = providers;
  const fill = (selectEl, providerId) => {
    const p = providers.find((x) => x.id === providerId);
    if (!p || !p.models) return;
    selectEl.innerHTML = '';
    for (const m of p.models) {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.id
        ? (m.builtIn ? window.i18n.t(m.label) : m.label)
        : window.i18n.t('CLI default (recommended)');
      if (m.description) opt.title = m.description;
      selectEl.appendChild(opt);
    }
  };
  fill(anthropicModelEl, 'anthropic');
  fill(openaiModelEl, 'openai');
  fill(groqNotesModelEl, 'groq');
  fill(claudeCodeModelEl, 'claudeCode');
  fill(codexModelEl, 'codex');
  populateCodexEfforts();

  // CLI provider availability hints
  const cc = providers.find((p) => p.id === 'claudeCode');
  const cx = providers.find((p) => p.id === 'codex');
  const ccStatus = document.getElementById('claudeCodeStatus');
  const cxStatus = document.getElementById('codexStatus');
  const ccDetail = document.getElementById('claudeCodeDetail');
  const cxDetail = document.getElementById('codexDetail');
  if (cc) {
    ccStatus.textContent = cc.available ? '· installed' : '· not found';
    ccStatus.style.color = cc.available ? '#30d158' : 'var(--danger)';
    ccDetail.textContent = cc.available
      ? `Found at ${cc.executable}. Uses your Claude Code subscription — no API key charged.`
      : 'No claude CLI found on PATH. Install Claude Code (npm install -g @anthropic-ai/claude-code) and re-launch CrunchyMurmur.';
  }
  if (cx) {
    cxStatus.textContent = cx.available ? '· installed' : '· not found';
    cxStatus.style.color = cx.available ? '#30d158' : 'var(--danger)';
    cxDetail.textContent = cx.available
      ? `Found at ${cx.executable}. Uses your Codex subscription — no API key charged.`
      : 'No codex CLI found on PATH. Install OpenAI Codex and re-launch CrunchyMurmur.';
  }
}

function selectAvailableModel(selectEl, modelId) {
  if (!modelId) return;
  if ([...selectEl.options].some(option => option.value === modelId)) selectEl.value = modelId;
}

saveAiNotesBtn.addEventListener('click', async () => {
  const provider = document.querySelector('input[name="aiNotesProvider"]:checked')?.value || 'anthropic';
  const cfg = await window.wisper.saveSettings({
    aiNotesProvider: provider,
    anthropicApiKey: anthropicApiKeyEl.value.trim(),
    anthropicModel: anthropicModelEl.value,
    openaiApiKey: openaiApiKeyEl.value.trim(),
    openaiModel: openaiModelEl.value,
    groqNotesModel: groqNotesModelEl.value,
    claudeCodeModel: claudeCodeModelEl.value.trim(),
    claudeCodeEffort: claudeCodeEffortEl.value,
    codexModel: codexModelEl.value.trim(),
    codexReasoningEffort: codexReasoningEffortEl.value,
  });
  window.__lastSettings = cfg;
  await populateAiNotesModels();
  selectAvailableModel(anthropicModelEl, cfg.anthropicModel);
  selectAvailableModel(openaiModelEl, cfg.openaiModel);
  selectAvailableModel(groqNotesModelEl, cfg.groqNotesModel);
  selectAvailableModel(claudeCodeModelEl, cfg.claudeCodeModel);
  selectAvailableModel(codexModelEl, cfg.codexModel);
  populateCodexEfforts(cfg.codexReasoningEffort || 'medium');
  renderAiNotesEffectiveConfig();
  aiNotesSaveStatusEl.textContent = 'Saved.';
  setTimeout(() => { aiNotesSaveStatusEl.textContent = ''; }, 1500);
});

async function saveGeneralSettings() {
  try {
    const cfg = await window.wisper.saveSettings({
      theme: selectedTheme(),
      uiLocale: uiLocaleEl.value,
      language: languageEl.value,
      micDeviceId: micDeviceEl.value,
      hotkey: hotkeyEl.value.trim(),
      autoUpdate: autoUpdateEl.value,
      audioRetentionPolicy: audioRetentionPolicyEl.value,
      aiFormatEnabled: aiFormatEnabledEl.value,
      groqFormatModel: groqFormatModelEl.value,
      aiFormatFallback: aiFormatFallbackEl.value,
      aiFormatSystemPrompt: aiFormatSystemPromptEl.value,
    });
    window.__lastSettings = cfg;
    setGeneralStatus(window.i18n.t('Saved.'), { clearAfterMs: 1500 });
  } catch (error) {
    setGeneralStatus(error.message || String(error), { error: true });
  }
}
saveGeneralBtns.forEach((btn) => btn.addEventListener('click', saveGeneralSettings));

// An empty prompt means "use the built-in default" (shown as the placeholder).
document.getElementById('resetFormatPrompt').addEventListener('click', () => {
  aiFormatSystemPromptEl.value = '';
  setGeneralStatus(window.i18n.t('Formatting instructions reset to the built-in default. Click Save to apply.'), { clearAfterMs: 4000 });
});

updateChannelEl.addEventListener('change', async () => {
  const previous = window.__lastSettings?.updateChannel || 'stable';
  const next = updateChannelEl.value;
  let confirmDowngrade = false;
  if (previous === 'nightly' && next === 'stable') {
    confirmDowngrade = window.confirm(window.i18n.t('Switch to Stable? If your Nightly version is newer, the Stable version will replace it after the next update check.'));
    if (!confirmDowngrade) { updateChannelEl.value = previous; return; }
  }
  try {
    const cfg = await window.wisper.setUpdateChannel(next, confirmDowngrade);
    window.__lastSettings = cfg;
  } catch (error) {
    updateChannelEl.value = previous;
    setGeneralStatus(error.message || String(error), { error: true });
    return;
  }
  try {
    renderUpdateStatus(await window.wisper.checkForUpdates());
  } catch (error) {
    setGeneralStatus(error.message || String(error), { error: true });
  }
});

uiLocaleEl.addEventListener('change', async () => {
  window.i18n.setLocale(uiLocaleEl.value, window.__lastSettings?.systemLocale);
  const cfg = await window.wisper.saveSettings({ uiLocale: uiLocaleEl.value });
  window.__lastSettings = cfg;
});
window.addEventListener('localechange', () => {
  render();
  void renderDashboard();
});

useFnHotkeyBtn.addEventListener('click', () => {
  hotkeyEl.value = 'Fn';
  renderHotkey('Fn');
  hotkeyHintEl.textContent = 'Hold Fn (🌐) to dictate; release it to transcribe.';
});

let isCapturingHotkey = false;

function hotkeyLabel(token) {
  const platform = window.__lastSettings?.platform;
  const labels = {
    Control: 'Ctrl', Ctrl: 'Ctrl', CommandOrControl: platform === 'darwin' ? 'Cmd' : 'Ctrl',
    Super: platform === 'win32' ? 'Win' : platform === 'darwin' ? 'Cmd' : 'Super',
    Command: 'Cmd', Alt: platform === 'darwin' ? 'Option' : 'Alt', Shift: 'Shift',
    Space: 'Space', Return: 'Enter', Escape: 'Esc',
  };
  return labels[token] || token;
}

function renderHotkey(value) {
  hotkeyDisplayEl.replaceChildren();
  for (const [index, token] of String(value || '').split('+').filter(Boolean).entries()) {
    if (index) hotkeyDisplayEl.append(document.createTextNode(' + '));
    const key = document.createElement('kbd');
    key.textContent = hotkeyLabel(token);
    hotkeyDisplayEl.append(key);
  }
}

function finishHotkeyCapture(value) {
  isCapturingHotkey = false;
  recordHotkeyBtn.textContent = 'Record shortcut';
  hotkeyEl.value = value;
  renderHotkey(value);
  hotkeyHintEl.textContent = value === 'Control+Super'
    ? 'Hold Ctrl + Win to dictate; release either key to transcribe.'
    : value === 'Fn' ? 'Hold Fn (🌐) to dictate; release it to transcribe.'
      : 'Press once to start dictation and press again to transcribe.';
}

function acceleratorKey(event) {
  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3);
  if (/^Digit[0-9]$/.test(event.code)) return event.code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(event.code)) return event.code;
  const byCode = {
    Space: 'Space', Enter: 'Return', NumpadEnter: 'Return', Tab: 'Tab', Backspace: 'Backspace',
    Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
    Escape: 'Escape', CapsLock: 'Capslock', NumLock: 'Numlock', ScrollLock: 'Scrolllock',
    MediaPlayPause: 'MediaPlayPause', MediaTrackNext: 'MediaNextTrack', MediaTrackPrevious: 'MediaPreviousTrack',
    AudioVolumeUp: 'VolumeUp', AudioVolumeDown: 'VolumeDown', AudioVolumeMute: 'VolumeMute',
  };
  return byCode[event.code] || null;
}

function pressedKeyLabel(event) {
  const supported = acceleratorKey(event);
  if (supported) return supported;
  if (event.key && event.key.length === 1) return event.key.toUpperCase();
  return event.key && event.key !== 'Unidentified' ? event.key : event.code || 'Unknown';
}

recordHotkeyBtn.addEventListener('click', () => {
  if (isCapturingHotkey) {
    finishHotkeyCapture(hotkeyEl.value);
    return;
  }
  isCapturingHotkey = true;
  recordHotkeyBtn.textContent = 'Cancel';
  hotkeyDisplayEl.textContent = 'Press shortcut…';
  hotkeyHintEl.textContent = 'Press at least one modifier and a key. On Windows, Ctrl + Win is also supported.';
  recordHotkeyBtn.blur();
});

window.addEventListener('keydown', (event) => {
  if (!isCapturingHotkey) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.key === 'Escape' && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey) {
    finishHotkeyCapture(hotkeyEl.value);
    return;
  }
  const modifiers = [];
  if (event.ctrlKey) modifiers.push('Control');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');
  if (event.metaKey) modifiers.push('Super');
  const modifierOnly = ['Control', 'Shift', 'Alt', 'Meta'].includes(event.key);
  if (modifierOnly) {
    if (window.__lastSettings?.platform === 'win32' && modifiers.length === 2
        && modifiers.includes('Control') && modifiers.includes('Super')) {
      finishHotkeyCapture('Control+Super');
    } else {
      renderHotkey(modifiers.join('+'));
      hotkeyHintEl.textContent = 'Keep holding the modifier, then press the other key.';
    }
    return;
  }
  const key = acceleratorKey(event);
  const visibleKey = pressedKeyLabel(event);
  renderHotkey([...modifiers, visibleKey].join('+'));
  const standaloneAllowed = Boolean(key) && (/^F([1-9]|1[0-9]|2[0-4])$/.test(key) || /^(Media|Volume)/.test(key));
  if (!key) {
    hotkeyHintEl.textContent = `“${visibleKey}” is visible, but Electron cannot register it as a global shortcut.`;
    return;
  }
  if (modifiers.length === 0 && !standaloneAllowed) {
    hotkeyHintEl.textContent = `Add Ctrl, Alt, Shift, or Super to ${hotkeyLabel(key)}.`;
    return;
  }
  finishHotkeyCapture([...modifiers, key].join('+'));
}, true);

function renderUpdateStatus(status) {
  if (status && updateStatusEl) {
    updateStatusEl.textContent = status.message || status.state;
    updateStatusEl.dataset.state = status.state || 'idle';
  }
}
window.wisper.onUpdateStatus(renderUpdateStatus);
document.getElementById('checkUpdates').addEventListener('click', async () => {
  updateStatusEl.textContent = 'Checking for updates…';
  try { renderUpdateStatus(await window.wisper.checkForUpdates()); }
  catch (error) { updateStatusEl.textContent = error.message || String(error); }
});
document.getElementById('openLogs').addEventListener('click', () => window.wisper.openLogs());
document.getElementById('copyDiagnostics').addEventListener('click', async () => {
  const diagnostics = await window.wisper.diagnostics();
  await window.wisper.copyText(JSON.stringify(diagnostics, null, 2));
  setGeneralStatus(window.i18n.t('Diagnostics copied.'), { clearAfterMs: 2500 });
});
document.getElementById('exportData').addEventListener('click', async () => {
  const result = await window.wisper.exportData();
  if (result?.ok) setGeneralStatus(window.i18n.t('Exported to {0}', { 0: result.path }));
});
document.getElementById('deleteData').addEventListener('click', () => window.wisper.deleteData());
document.getElementById('openPrivacy').addEventListener('click', () => window.wisper.openLegal('privacy'));
document.getElementById('openTerms').addEventListener('click', () => window.wisper.openLegal('terms'));

async function renderPermissions() {
  const list = document.getElementById('permissionsList');
  const statuses = await window.wisper.permissionsStatus();
  const labels = {
    microphone: 'Microphone', screen: 'Screen & system audio', accessibility: 'Accessibility',
    inputMonitoring: 'Input Monitoring', calendar: 'Calendar',
  };
  list.innerHTML = '';
  for (const [kind, label] of Object.entries(labels)) {
    const row = document.createElement('div');
    row.className = 'permission-row';
    const status = String(statuses[kind] || 'unknown');
    row.innerHTML = `<span>${label}</span><span class="permission-status ${escapeHtml(status)}">${escapeHtml(status.replaceAll('-', ' '))}</span><button class="text-button" type="button">Open settings</button>`;
    row.querySelector('button').addEventListener('click', () => window.wisper.permissionsOpen(kind));
    list.appendChild(row);
  }
}

async function refreshMeetingAudioUsage() {
  const bytes = await window.wisper.meetingsAudioUsage();
  document.getElementById('meetingAudioUsage').textContent = `${formatBytes(bytes)} of meeting audio stored`;
}

document.getElementById('applyAudioRetention').addEventListener('click', async () => {
  const result = await window.wisper.meetingsCleanupAudio(audioRetentionPolicyEl.value);
  setGeneralStatus(result.cleaned
    ? window.i18n.t('Removed audio from {0} meeting{1}.', { 0: result.cleaned, 1: result.cleaned === 1 ? '' : 's' })
    : window.i18n.t('No meeting audio matched this rule.'));
  await refreshMeetingAudioUsage();
  await renderPermissions();
});
document.getElementById('deleteAllMeetingAudio').addEventListener('click', async () => {
  if (!confirm('Delete all saved meeting audio? Transcripts and notes will be kept.')) return;
  const result = await window.wisper.meetingsDeleteAllAudio();
  setGeneralStatus(result.cleaned
    ? window.i18n.t('Deleted audio from {0} meeting{1}.', { 0: result.cleaned, 1: result.cleaned === 1 ? '' : 's' })
    : window.i18n.t('There was no meeting audio to delete.'));
  await refreshMeetingAudioUsage();
});

(async () => {
  const cfg = await window.wisper.getSettings();
  window.__lastSettings = cfg;
  uiLocaleEl.value = cfg.uiLocale || 'system';
  window.i18n.setLocale(uiLocaleEl.value, cfg.systemLocale);
  document.documentElement.dataset.platform = cfg.platform;
  whisperCliPathEl.value = cfg.whisperCliPath || '';
  parakeetModelPathEl.value = cfg.parakeetModelPath || '';
  modelPathEl.value = cfg.modelPath || '';
  groqApiKeyEl.value = cfg.groqApiKey || '';
  groqModelEl.value = cfg.groqModel || 'whisper-large-v3-turbo';
  languageEl.value = cfg.language || 'auto';
  const defaultHotkey = cfg.platform === 'win32' ? 'Control+Super' : cfg.platform === 'darwin' ? 'Fn' : 'CommandOrControl+Shift+Space';
  hotkeyEl.value = cfg.hotkey || defaultHotkey;
  renderHotkey(hotkeyEl.value);
  hotkeyHintEl.textContent = hotkeyEl.value === 'Control+Super'
    ? 'Hold Ctrl + Win to dictate; release either key to transcribe.'
    : hotkeyEl.value === 'Fn' ? 'Hold Fn (🌐) to dictate; release it to transcribe.'
      : 'Press once to start dictation and press again to transcribe.';
  useFnHotkeyBtn.hidden = cfg.platform !== 'darwin';
  document.getElementById('sidebarHint').innerHTML = hotkeyEl.value === 'Fn'
    ? 'Hold <kbd>Fn</kbd> anywhere to dictate.'
    : hotkeyEl.value === 'Control+Super' ? 'Hold <kbd>Ctrl</kbd>+<kbd>Win</kbd> anywhere to dictate.'
      : 'Use your global shortcut anywhere to dictate.';
  autoUpdateEl.value = cfg.autoUpdate || 'true';
  updateChannelEl.value = cfg.updateChannel || 'stable';
  const theme = ['system', 'light', 'dark'].includes(cfg.theme) ? cfg.theme : 'system';
  const themeInput = themeInputs.find((input) => input.value === theme);
  if (themeInput) themeInput.checked = true;
  updateThemeHint();
  audioRetentionPolicyEl.value = cfg.audioRetentionPolicy || 'never';
  aiFormatEnabledEl.value = cfg.aiFormatEnabled || 'false';
  groqFormatModelEl.value = cfg.groqFormatModel || 'llama-3.1-8b-instant';
  aiFormatFallbackEl.value = cfg.aiFormatFallback || 'raw';
  aiFormatSystemPromptEl.value = cfg.aiFormatSystemPrompt || '';
  aiFormatSystemPromptEl.placeholder = cfg.aiFormatSystemPromptDefault || '';
  await refreshMeetingAudioUsage();
  await renderPermissions();
  document.getElementById('appDetails').textContent = `CrunchyMurmur ${cfg.version} · ${cfg.platform} ${cfg.arch}`;
  renderUpdateStatus(await window.wisper.getUpdateStatus());
  applyEngineKind(cfg.engineKind || 'parakeet');
  await populateMicDevices(cfg.micDeviceId || '');

  // AI Notes provider config
  await populateAiNotesModels();
  applyAiNotesProvider(cfg.aiNotesProvider || 'anthropic');
  anthropicApiKeyEl.value = cfg.anthropicApiKey || '';
  selectAvailableModel(anthropicModelEl, cfg.anthropicModel || 'claude-sonnet-4-6');
  openaiApiKeyEl.value = cfg.openaiApiKey || '';
  selectAvailableModel(openaiModelEl, cfg.openaiModel || 'gpt-4o');
  selectAvailableModel(groqNotesModelEl, cfg.groqNotesModel || 'openai/gpt-oss-120b');
  selectAvailableModel(claudeCodeModelEl, cfg.claudeCodeModel || '');
  claudeCodeEffortEl.value = cfg.claudeCodeEffort || 'medium';
  selectAvailableModel(codexModelEl, cfg.codexModel || '');
  populateCodexEfforts(cfg.codexReasoningEffort || 'medium');
  renderAiNotesEffectiveConfig();

  entries = await window.wisper.getHistory();
  render();
  await renderDashboard();

  // Models tab data + the path label in the header.
  modelsDirPathEl.textContent = await window.wisper.modelsDir();
  await refreshCatalog();
  await populateInstalledPicker();

  // Notes tab data — folders, notes, then drop into the most recent note
  // of the first folder for immediate continuity.
  await reloadNotes(true);

  // Templates tab data.
  await reloadTemplates();

  // Calendar snapshot — initial render is fast even before fetches finish
  // (we just show whatever's cached). Then refresh in the background so any
  // new events show up.
  calendarSnapshot = await window.wisper.calendarSnapshot();
  renderCalendar();
  if (calendarSnapshot.feeds.length > 0 || cfg.platform === 'darwin') {
    window.wisper.calendarRefresh();
  }

  // Meetings list
  meetingsList = await window.wisper.meetingsList();
  renderMeetingsAll();

  const needsSetup = (cfg.engineKind === 'groq')
    ? !cfg.groqApiKey
    : cfg.engineKind === 'parakeet'
      ? !cfg.parakeetModelPath
      : !cfg.modelPath;
  if (needsSetup) {
    switchTab('engine');
  }
  document.documentElement.dataset.ready = 'true';
})();
