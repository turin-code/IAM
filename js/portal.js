import { escapeHtml } from './markdown.js';
import {
  formatDepartmentName,
  getDisplayStudentId,
  getSessionAndProfile,
  getSupabaseClient,
  isAdminUser,
  isSupabaseConfigured,
  parseStudentId,
  signOut,
} from './supabase-client.js';

const roleEl = document.getElementById('portal-role');
const studentIdEl = document.getElementById('portal-student-id');
const navAdmin = document.getElementById('nav-admin');
const navWrite = document.getElementById('nav-write');
const signOutBtn = document.getElementById('signout-btn');
const statusEl = document.getElementById('portal-status');
const contentEl = document.getElementById('portal-content');

const statTakenEl = document.getElementById('stat-taken');
const statCreditsEl = document.getElementById('stat-credits');
const statCgpaEl = document.getElementById('stat-cgpa');
const takenListEl = document.getElementById('taken-list');
const catalogListEl = document.getElementById('catalog-list');

const evalForm = document.getElementById('eval-form');
const courseInput = document.getElementById('course-code');
const masterySelect = document.getElementById('mastery-score');
const topicInput = document.getElementById('eval-topic');
const reflectionInput = document.getElementById('eval-reflection');
const evalSubmit = document.getElementById('eval-submit');
const evalList = document.getElementById('eval-list');

let activeUser = null;
let studentDept = '';

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function safeHttpUrl(url) {
  return /^https?:\/\//i.test(String(url || '').trim()) ? url.trim() : '';
}

function formatMaterials(course) {
  const links = [];
  const q = safeHttpUrl(course.exam_question_url);
  const a = safeHttpUrl(course.assignments_url);
  const s = safeHttpUrl(course.solutions_url);
  if (q) links.push(`<a href="${escapeHtml(q)}" target="_blank" rel="noopener">Questions (PDF)</a>`);
  if (a) links.push(`<a href="${escapeHtml(a)}" target="_blank" rel="noopener">Assignments (PDF)</a>`);
  if (s) links.push(`<a href="${escapeHtml(s)}" target="_blank" rel="noopener">Solutions (PDF)</a>`);
  return links.length > 0 ? `<div class="nav-links small" style="margin-top:0.5rem;">${links.join('')}</div>` : '';
}

function renderAcademicStats(enrollments) {
  statTakenEl.textContent = String(enrollments.length);

  let gainedCredits = 0;
  let totalGradedCredits = 0;
  let weightedPoints = 0;

  for (const row of enrollments) {
    const credit = Number(row.courses?.credit || 0);
    const gp = row.grade_point === null ? null : Number(row.grade_point);
    if (row.status === 'completed' && gp !== null) {
      totalGradedCredits += credit;
      weightedPoints += credit * gp;
      if (gp > 0) {
        gainedCredits += credit;
      }
    }
  }

  statCreditsEl.textContent = gainedCredits.toFixed(1);
  statCgpaEl.textContent =
    totalGradedCredits > 0 ? (weightedPoints / totalGradedCredits).toFixed(2) : '—';
}

function renderTakenCourses(enrollments) {
  if (enrollments.length === 0) {
    takenListEl.innerHTML =
      '<li class="paper-item muted small">No courses taken yet. Enroll from Available Courses below.</li>';
    return;
  }

  takenListEl.innerHTML = enrollments
    .map((row) => {
      const c = row.courses || {};
      const gradeText =
        row.grade_point !== null
          ? `Grade: ${escapeHtml(row.letter_grade || Number(row.grade_point).toFixed(2))} (${Number(row.grade_point).toFixed(2)})`
          : 'In Progress';
      const canDrop = row.status === 'enrolled' && row.grade_point === null;

      return `
        <li class="paper-item">
          <div class="paper-item-meta">
            ${escapeHtml(c.course_code || '')} &middot; ${escapeHtml(Number(c.credit || 0).toFixed(1))} Credits &middot; ${escapeHtml(row.status.toUpperCase())} &middot; ${gradeText}
          </div>
          <h3 class="paper-item-title">${escapeHtml(c.title || '')}</h3>
          ${c.outline ? `<p class="paper-item-summary">${escapeHtml(c.outline)}</p>` : ''}
          ${formatMaterials(c)}
          ${
            canDrop
              ? `<div style="margin-top:0.65rem;"><button type="button" class="btn btn-secondary btn-sm drop-course-btn" data-enrollment-id="${escapeHtml(row.id)}">Drop Course</button></div>`
              : ''
          }
        </li>
      `;
    })
    .join('');
}

function renderCatalog(courses, enrolledIds) {
  const relevant = courses.filter(
    (c) => !studentDept || c.department_code === 'ALL' || c.department_code === studentDept
  );

  if (relevant.length === 0) {
    catalogListEl.innerHTML =
      '<li class="paper-item muted small">No courses published yet.</li>';
    return;
  }

  catalogListEl.innerHTML = relevant
    .map((c) => {
      const alreadyEnrolled = enrolledIds.has(c.id);
      return `
        <li class="paper-item">
          <div class="paper-item-meta">
            ${escapeHtml(c.course_code)} &middot; ${escapeHtml(formatDepartmentName(c.department_code))} &middot; ${escapeHtml(Number(c.credit).toFixed(1))} Credits
          </div>
          <h3 class="paper-item-title">${escapeHtml(c.title)}</h3>
          ${c.outline ? `<p class="paper-item-summary">${escapeHtml(c.outline)}</p>` : ''}
          ${formatMaterials(c)}
          <div style="margin-top:0.65rem;">
            ${
              alreadyEnrolled
                ? '<span class="mono small muted">Enrolled</span>'
                : `<button type="button" class="btn btn-sm enroll-course-btn" data-course-id="${escapeHtml(c.id)}">Enroll</button>`
            }
          </div>
        </li>
      `;
    })
    .join('');
}

async function loadCoursesAndEnrollments() {
  const client = getSupabaseClient();
  const [coursesRes, enrollRes] = await Promise.all([
    client
      .from('courses')
      .select('id, course_code, title, department_code, credit, outline, exam_question_url, assignments_url, solutions_url')
      .order('course_code', { ascending: true }),
    client
      .from('enrollments')
      .select('id, course_id, status, grade_point, letter_grade, courses(id, course_code, title, department_code, credit, outline, exam_question_url, assignments_url, solutions_url)')
      .eq('user_id', activeUser.id)
      .order('created_at', { ascending: false }),
  ]);

  if (coursesRes.error) throw coursesRes.error;
  if (enrollRes.error) throw enrollRes.error;

  const courses = coursesRes.data || [];
  const enrollments = enrollRes.data || [];
  const enrolledIds = new Set(enrollments.map((e) => e.course_id));

  renderAcademicStats(enrollments);
  renderTakenCourses(enrollments);
  renderCatalog(courses, enrolledIds);
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
    const parsed = parseStudentId(displayId);
    studentDept = profile?.department_code || parsed?.programCode || '';

    studentIdEl.textContent = `ID: ${displayId}`;
    roleEl.textContent = parsed
      ? `${parsed.programName} · ${parsed.year} · Roll ${parsed.roll}`
      : admin
        ? 'ADMIN'
        : 'STUDENT';
    navAdmin.classList.toggle('hidden', !admin);
    navWrite.classList.toggle('hidden', !admin);
    contentEl.classList.remove('hidden');

    await Promise.all([loadCoursesAndEnrollments(), loadEvaluations()]);
  } catch (err) {
    setStatus(err.message || 'Unable to load portal data.', true);
  }
}

catalogListEl.addEventListener('click', async (event) => {
  const btn = event.target.closest('.enroll-course-btn');
  if (!btn) return;
  setStatus('');
  btn.disabled = true;
  try {
    const client = getSupabaseClient();
    const { error } = await client.from('enrollments').insert({
      user_id: activeUser.id,
      course_id: btn.dataset.courseId,
    });
    if (error) throw error;
    await loadCoursesAndEnrollments();
  } catch (err) {
    setStatus(err.message || 'Unable to enroll in course.', true);
    btn.disabled = false;
  }
});

takenListEl.addEventListener('click', async (event) => {
  const btn = event.target.closest('.drop-course-btn');
  if (!btn) return;
  setStatus('');
  btn.disabled = true;
  try {
    const client = getSupabaseClient();
    const { error } = await client
      .from('enrollments')
      .delete()
      .eq('id', btn.dataset.enrollmentId);
    if (error) throw error;
    await loadCoursesAndEnrollments();
  } catch (err) {
    setStatus(err.message || 'Unable to drop course.', true);
    btn.disabled = false;
  }
});

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
    evalSubmit.textContent = 'Submit';
  }
});

signOutBtn.addEventListener('click', async () => {
  await signOut();
  window.location.href = './index.html';
});

initPortal();
