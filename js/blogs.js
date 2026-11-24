import { escapeHtml } from './markdown.js';
import {
  getDisplayStudentId,
  getSessionAndProfile,
  isAdminUser,
  isSupabaseConfigured,
} from './supabase-client.js';

const postListEl = document.getElementById('post-list');
const statusEl = document.getElementById('blogs-status');
const navPortal = document.getElementById('nav-portal');
const navWrite = document.getElementById('nav-write');
const navUser = document.getElementById('nav-user');

async function loadNavSession() {
  if (!isSupabaseConfigured()) {
    return;
  }
  try {
    const { user, profile } = await getSessionAndProfile();
    if (!user) {
      return;
    }
    const id = getDisplayStudentId(profile, user);
    const admin = isAdminUser(profile, user);
    navUser.textContent = `ID: ${id}`;
    navPortal.classList.remove('hidden');
    if (admin) {
      navWrite.classList.remove('hidden');
    }
  } catch {
    // Public page still works even if session lookup fails
  }
}

async function loadPosts() {
  try {
    const response = await fetch('./posts/index.json', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Could not load blog index (${response.status}).`);
    }
    const posts = await response.json();
    if (!Array.isArray(posts) || posts.length === 0) {
      statusEl.textContent = 'No technical notes have been published yet.';
      return;
    }

    postListEl.innerHTML = posts
      .map((post) => {
        const slug = encodeURIComponent(post.slug);
        return `
          <li class="paper-item">
            <div class="paper-item-meta">${escapeHtml(post.date)} &middot; Author ID: ${escapeHtml(post.authorId || 'admin')}</div>
            <h3 class="paper-item-title">
              <a href="./post.html?slug=${slug}">${escapeHtml(post.title)}</a>
            </h3>
            <p class="paper-item-summary">${escapeHtml(post.summary || '')}</p>
          </li>
        `;
      })
      .join('');
  } catch (err) {
    statusEl.textContent = err.message || 'Failed to load blog posts.';
    statusEl.classList.add('error');
  }
}

loadNavSession();
loadPosts();

