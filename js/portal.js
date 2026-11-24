import { escapeHtml } from './markdown.js';
import {
  getDisplayStudentId,
  getSessionAndProfile,
  getSupabaseClient,
  isAdminUser,
  isSupabaseConfigured,
  signOut,
} from './supabase-client.js';

const roleEl = document.getElementById('portal-role');
const studentIdEl = document.getElementById('portal-student-id');
const navWrite = document.getElementById('nav-write');
const signOutBtn = document.getElementById('signout-btn');
const statusEl = document.getElementById('portal-status');
const contentEl = document.getElementById('portal-content');

const evalForm = document.getElementById('eval-form');
const courseInput = document.getElementById('course-code');
const masterySelect = document.getElementById('mastery-score');
const topicInput = document.getElementById('eval-topic');
const reflectionInput = document.getElementById('eval-reflection');
const evalSubmit = document.getElementById('eval-submit');
const evalList = document.getElementById('eval-list');

let activeUser = null;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

async function loadEvaluations() {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('self_evaluations')
    .select('id, course_code, topic, reflection, mastery_score, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  if (!data || data.length === 0) {
    evalList.innerHTML =
      '<li class="paper-item muted small">No self-evaluations recorded yet.</li>';
    return;
  }

  evalList.innerHTML = data
    .map((entry) => {
      const dateStr = new Date(entry.created_at).toISOString().slice(0, 10);
      return `
        <li class="paper-item">
          <div class="paper-item-meta">
            ${escapeHtml(dateStr)} &middot; ${escapeHtml(entry.course_code)} &middot; Mastery ${escapeHtml(entry.mastery_score)}/5
          </div>
          <h3 class="paper-item-title">${escapeHtml(entry.topic)}</h3>
          <p class="paper-item-summary">${escapeHtml(entry.reflection)}</p>
        </li>
      `;
    })
    .join('');
}

async function initPortal() {
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

    activeUser = user;
    const displayId = getDisplayStudentId(profile, user);
    const admin = isAdminUser(profile, user);

    studentIdEl.textContent = `ID: ${displayId}`;
    roleEl.textContent = admin ? 'ADMIN' : 'STUDENT';
    navWrite.classList.toggle('hidden', !admin);
    contentEl.classList.remove('hidden');

    await loadEvaluations();
  } catch (err) {
    setStatus(err.message || 'Unable to load portal data.', true);
  }
}

evalForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus('');

  const courseCode = courseInput.value.trim();
  const topic = topicInput.value.trim();
  const reflection = reflectionInput.value.trim();
  const masteryScore = Number(masterySelect.value);

  if (!courseCode || !topic || !reflection) {
    setStatus('Complete all self-evaluation fields.', true);
    return;
  }

  evalSubmit.disabled = true;
  evalSubmit.textContent = 'Saving...';
  try {
    const client = getSupabaseClient();
    const { error } = await client.from('self_evaluations').insert({
      user_id: activeUser.id,
      course_code: courseCode,
      topic,
      reflection,
      mastery_score: masteryScore,
    });
    if (error) {
      throw error;
    }

    evalForm.reset();
    masterySelect.value = '3';
    setStatus('Self-evaluation recorded.');
    await loadEvaluations();
  } catch (err) {
    setStatus(err.message || 'Failed to save self-evaluation.', true);
  } finally {
    evalSubmit.disabled = false;
    evalSubmit.textContent = 'Submit Evaluation';
  }
});

signOutBtn.addEventListener('click', async () => {
  await signOut();
  window.location.href = './index.html';
});

initPortal();

