import { renderMarkdown } from './markdown.js';

const titleEl = document.getElementById('post-title');
const dateEl = document.getElementById('post-date');
const authorEl = document.getElementById('post-author');
const slugEl = document.getElementById('post-slug');
const abstractBox = document.getElementById('post-abstract');
const summaryEl = document.getElementById('post-summary');
const bodyEl = document.getElementById('post-body');
const statusEl = document.getElementById('post-status');

function showError(msg) {
  titleEl.textContent = 'Manuscript Unavailable';
  statusEl.textContent = msg;
  statusEl.classList.add('error');
}

async function loadPost() {
  const params = new URLSearchParams(window.location.search);
  const rawSlug = params.get('slug') || '';
  const slug = rawSlug.replace(/[^a-zA-Z0-9_-]/g, '');

  if (!slug) {
    showError('No manuscript slug was specified.');
    return;
  }

  slugEl.textContent = `posts/${slug}.md`;

  try {
    const [indexRes, mdRes] = await Promise.all([
      fetch('./posts/index.json', { cache: 'no-store' }),
      fetch(`./posts/${encodeURIComponent(slug)}.md`, { cache: 'no-store' }),
    ]);

    if (!mdRes.ok) {
      throw new Error(`Manuscript "${slug}" was not found (${mdRes.status}).`);
    }

    if (indexRes.ok) {
      const posts = await indexRes.json();
      const meta = Array.isArray(posts) ? posts.find((p) => p.slug === slug) : null;
      if (meta) {
        document.title = `${meta.title} — IAM`;
        titleEl.textContent = meta.title;
        dateEl.textContent = meta.date || '—';
        authorEl.textContent = `Author ID: ${meta.authorId || 'admin'}`;
        if (meta.summary) {
          summaryEl.textContent = meta.summary;
          abstractBox.classList.remove('hidden');
        }
      } else {
        titleEl.textContent = slug;
      }
    } else {
      titleEl.textContent = slug;
    }

    const markdown = await mdRes.text();
    bodyEl.innerHTML = renderMarkdown(markdown);
  } catch (err) {
    showError(err.message || 'Unable to load manuscript.');
  }
}

loadPost();

