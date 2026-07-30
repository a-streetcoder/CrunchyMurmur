// CrunchyMurmur docs viewer.
//
// The GitHub repository is the single source of truth: this page fetches the
// Markdown under docs/ from raw.githubusercontent.com (branch main) at load
// time and renders it client-side with the vendored markdown-it. Nothing is
// copied into the site, so docs edits on GitHub appear here immediately.
//
// Coupling: the manifest below lists docs/ files by path. Adding, renaming, or
// removing a doc must be mirrored here. See AGENTS.md → "Website".

(function () {
  'use strict';

  const REPO = 'a-streetcoder/CrunchyMurmur';
  const BRANCH = 'main';
  const RAW_ROOT = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/`;
  const BLOB_ROOT = `https://github.com/${REPO}/blob/${BRANCH}/`;

  // slug ↔ docs/ file manifest, grouped for the sidebar.
  const DOCS = [
    { slug: 'getting-started', file: 'getting-started.md', title: 'Getting started', group: 'Guides' },
    { slug: 'features', file: 'features.md', title: 'Features and providers', group: 'Guides' },
    { slug: 'platform-support', file: 'platform-support.md', title: 'Platform support', group: 'Guides' },
    { slug: 'updating', file: 'updating.md', title: 'Updating', group: 'Guides' },
    { slug: 'troubleshooting', file: 'troubleshooting.md', title: 'Troubleshooting', group: 'Guides' },
    { slug: 'building-from-source', file: 'building-from-source.md', title: 'Building from source', group: 'Development' },
    { slug: 'architecture', file: 'architecture.md', title: 'Architecture', group: 'Development' },
    { slug: 'on-device-sdk', file: 'on-device-sdk.md', title: 'On-device SDK', group: 'Development' },
    { slug: 'releasing', file: 'releasing.md', title: 'Release process', group: 'Development' },
    { slug: 'roadmap', file: 'project/roadmap.md', title: 'Roadmap', group: 'Project' },
    { slug: 'status', file: 'project/status.md', title: 'Project status', group: 'Project' },
    { slug: 'support', file: 'project/support.md', title: 'Support', group: 'Project' },
    { slug: 'privacy', file: 'legal/privacy.md', title: 'Privacy notice', group: 'Legal' },
    { slug: 'terms', file: 'legal/terms.md', title: 'Terms of use', group: 'Legal' },
  ];
  const DEFAULT_SLUG = DOCS[0].slug;
  const bySlug = new Map(DOCS.map((d) => [d.slug, d]));
  const byFile = new Map(DOCS.map((d) => [`docs/${d.file}`, d]));

  const md = window.markdownit({ html: false, linkify: true });
  const contentEl = document.getElementById('doc-content');
  const sourceLink = document.getElementById('doc-source-link');
  const sidebar = document.getElementById('docs-sidebar');

  // --- Sidebar ---
  const groups = [];
  for (const doc of DOCS) {
    let group = groups.find((g) => g.name === doc.group);
    if (!group) { group = { name: doc.group, docs: [] }; groups.push(group); }
    group.docs.push(doc);
  }
  for (const group of groups) {
    const h = document.createElement('h4');
    h.textContent = group.name;
    sidebar.appendChild(h);
    const ul = document.createElement('ul');
    for (const doc of group.docs) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `#${doc.slug}`;
      a.textContent = doc.title;
      a.dataset.slug = doc.slug;
      li.appendChild(a);
      ul.appendChild(li);
    }
    sidebar.appendChild(ul);
  }

  function markActive(slug) {
    sidebar.querySelectorAll('a[data-slug]').forEach((a) => {
      a.classList.toggle('active', a.dataset.slug === slug);
    });
  }

  function slugifyHeading(text) {
    return text.toLowerCase().trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-');
  }

  // Rewrite relative links/images so the rendered page behaves like GitHub:
  // links to manifest docs stay on this page, other repo paths go to GitHub,
  // relative images load from raw.githubusercontent.com.
  function rewriteContent(doc) {
    const base = RAW_ROOT + 'docs/' + doc.file;

    contentEl.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
      if (!h.id) h.id = slugifyHeading(h.textContent);
    });

    contentEl.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href');
      if (href.startsWith('#') || href.startsWith('mailto:')) return;
      let resolved;
      try { resolved = new URL(href, base); } catch { return; }
      if (resolved.origin === 'https://raw.githubusercontent.com') {
        const repoPath = resolved.pathname.replace(`/${REPO}/${BRANCH}/`, '');
        const known = byFile.get(repoPath);
        if (known) {
          a.href = `#${known.slug}`;
          return;
        }
        a.href = BLOB_ROOT + repoPath + resolved.hash;
      }
      a.target = '_blank';
      a.rel = 'noopener';
    });

    contentEl.querySelectorAll('img[src]').forEach((img) => {
      const src = img.getAttribute('src');
      try { img.src = new URL(src, base).href; } catch { /* leave as-is */ }
      img.loading = 'lazy';
    });
  }

  let currentSlug = null;

  function loadDoc(slug) {
    const doc = bySlug.get(slug);
    if (!doc || slug === currentSlug) return;
    currentSlug = slug;
    markActive(slug);
    document.title = `${doc.title} — CrunchyMurmur docs`;
    sourceLink.href = BLOB_ROOT + 'docs/' + doc.file;
    contentEl.innerHTML = '<p class="doc-loading">Loading documentation from GitHub…</p>';

    fetch(RAW_ROOT + 'docs/' + doc.file)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((markdown) => {
        if (currentSlug !== slug) return; // superseded by a newer navigation
        contentEl.innerHTML = md.render(markdown);
        rewriteContent(doc);
        window.scrollTo(0, 0);
      })
      .catch(() => {
        if (currentSlug !== slug) return;
        contentEl.innerHTML =
          '<p class="doc-loading">Could not load this page from GitHub right now. ' +
          `Read it directly at <a href="${BLOB_ROOT}docs/${doc.file}" target="_blank" rel="noopener">github.com/${REPO}</a>.</p>`;
      });
  }

  // Hash routing: a hash matching a manifest slug switches documents; any
  // other hash is an in-page heading anchor and scrolls natively.
  function route() {
    const hash = location.hash.replace(/^#/, '');
    if (bySlug.has(hash)) {
      loadDoc(hash);
    } else if (!hash) {
      loadDoc(DEFAULT_SLUG);
    } else {
      const target = document.getElementById(hash);
      if (target) target.scrollIntoView();
    }
  }

  window.addEventListener('hashchange', route);
  route();
})();
