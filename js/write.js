import { publishPostToGitHub, slugify, upsertPostIndex } from './github-publisher.js';
import { renderMarkdown } from './markdown.js';
import {
  getDisplayStudentId,
  getSessionAndProfile,
  isAdminUser,
  isSupabaseConfigured,
  signOut,
} from './supabase-client.js';

const adminIdEl = document.getElementById('writer-admin-id');
const signOutBtn = document.getElementById('signout-btn');
const statusEl = document.getElementById('writer-status');
const contentEl = document.getElementById('writer-content');

const writerForm = document.getElementById('writer-form');
const titleInput = document.getElementById('post-title');
const slugInput = document.getElementById('post-slug');
const dateInput = document.getElementById('post-date');
const summaryInput = document.getElementById('post-summary');
const markdownInput = document.getElementById('post-markdown');
const tokenInput = document.getElementById('github-token');
const publishBtn = document.getElementById('publish-btn');
const downloadBtn = document.getElementById('download-btn');
const previewEl = document.getElementById('markdown-preview');

let currentAdminId = 'admin';
let slugEditedManually = false;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function updatePreview() {
  const md = markdownInput.value.trim();
  previewEl.innerHTML = md
    ? renderMarkdown(md)
    : '<p class="muted small">Live preview appears here as you write Markdown.</p>';
}

function triggerDownload(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function initWriter() {
  dateInput.value = new Date().toISOString().slice(0, 10);
  updatePreview();

  if (!isSupabaseConfigured()) {
    setStatus('Supabase is not configured. Update js/config.js first.', true);
    return;
  }

  try {
    const { user, profile } = await getSessionAndProfile();
    if (!user) {
      window.location.href = './index.html';
      return;
    }

    if (!isAdminUser(profile, user)) {
      setStatus('Access restricted: signed-in ID does not have admin privileges.', true);
      return;
    }

    currentAdminId = getDisplayStudentId(profile, user);
    adminIdEl.textContent = `Admin ID: ${currentAdminId}`;
    contentEl.classList.remove('hidden');

    const savedToken = sessionStorage.getItem('iam_gh_token');
    if (savedToken) {
      tokenInput.value = savedToken;
    }
  } catch (err) {
    setStatus(err.message || 'Unable to verify admin session.', true);
  }
}

titleInput.addEventListener('input', () => {
  if (!slugEditedManually) {
    slugInput.value = slugify(titleInput.value);
  }
});

slugInput.addEventListener('input', () => {
  slugEditedManually = slugInput.value.trim().length > 0;
});

markdownInput.addEventListener('input', updatePreview);

writerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus('');

  const title = titleInput.value.trim();
  const slug = slugify(slugInput.value || title);
  const date = dateInput.value.trim();
  const summary = summaryInput.value.trim();
  const markdown = markdownInput.value;
  const token = tokenInput.value.trim();

  if (!title || !slug || !date || !summary || !markdown.trim()) {
    setStatus('Fill in title, slug, date, summary, and Markdown body.', true);
    return;
  }
  if (!token) {
    setStatus('Enter a GitHub Personal Access Token or use Download instead.', true);
    return;
  }

  sessionStorage.setItem('iam_gh_token', token);
  publishBtn.disabled = true;
  publishBtn.textContent = 'Publishing...';

  try {
    const result = await publishPostToGitHub({
      token,
      slug,
      title,
      summary,
      authorId: currentAdminId,
      date,
      markdown,
    });
    setStatus(`Published ${result.postPath} and updated posts/index.json on GitHub.`);
  } catch (err) {
    setStatus(err.message || 'GitHub publish failed.', true);
  } finally {
    publishBtn.disabled = false;
    publishBtn.textContent = 'Publish to GitHub Repo';
  }
});

downloadBtn.addEventListener('click', async () => {
  setStatus('');
  const title = titleInput.value.trim();
  const slug = slugify(slugInput.value || title);
  const date = dateInput.value.trim();
  const summary = summaryInput.value.trim();
  const markdown = markdownInput.value;

  if (!title || !slug || !markdown.trim()) {
    setStatus('Provide at least a title, slug, and Markdown body before downloading.', true);
    return;
  }

  let existingPosts = [];
  try {
    const res = await fetch('./posts/index.json', { cache: 'no-store' });
    if (res.ok) {
      existingPosts = await res.json();
    }
  } catch {
    // Fallback to empty array if offline
  }

  const entry = {
    slug,
    title,
    summary,
    authorId: currentAdminId,
    date,
  };
  const updatedPosts = upsertPostIndex(existingPosts, entry);

  triggerDownload(`${slug}.md`, markdown);
  triggerDownload('index.json', `${JSON.stringify(updatedPosts, null, 2)}\n`);
  setStatus(`Downloaded ${slug}.md and updated index.json for manual git commit into posts/.`);
});

signOutBtn.addEventListener('click', async () => {
  sessionStorage.removeItem('iam_gh_token');
  await signOut();
  window.location.href = './index.html';
});

initWriter();
