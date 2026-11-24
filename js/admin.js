import { COURSE_MATERIAL_BUCKET } from './config.js';
import { escapeHtml } from './markdown.js';
import {
  formatDepartmentName,
  getDisplayStudentId,
  getSessionAndProfile,
  getSupabaseClient,
  isAdminUser,
  isSupabaseConfigured,
  signOut,
} from './supabase-client.js';

const adminIdLabel = document.getElementById('admin-id-label');
const signOutBtn = document.getElementById('signout-btn');
const statusEl = document.getElementById('admin-status');
const contentEl = document.getElementById('admin-content');

const appsListEl = document.getElementById('applications-list');
const courseForm = document.getElementById('course-form');
const courseEditId = document.getElementById('course-edit-id');
const cCode = document.getElementById('c-code');
const cDept = document.getElementById('c-dept');
const cCredit = document.getElementById('c-credit');
const cTitle = document.getElementById('c-title');
const cOutline = document.getElementById('c-outline');
const cQuestionsFile = document.getElementById('c-questions-file');
const cAssignmentsFile = document.getElementById('c-assignments-file');
const cSolutionsFile = document.getElementById('c-solutions-file');
const courseSubmit = document.getElementById('course-submit');
const courseCancel = document.getElementById('course-cancel');
const adminCoursesList = document.getElementById('admin-courses-list');
const enrollmentsList = document.getElementById('enrollments-list');

let coursesCache = [];

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function gradePointToLetter(gp) {
  if (gp >= 4.0) return 'A+';
  if (gp >= 3.75) return 'A';
  if (gp >= 3.5) return 'A-';
  if (gp >= 3.25) return 'B+';
  if (gp >= 3.0) return 'B';
  if (gp >= 2.75) return 'B-';
  if (gp >= 2.5) return 'C+';
  if (gp >= 2.25) return 'C';
  if (gp >= 2.0) return 'D';
  return 'F';
}

async function uploadPdf(courseCode, kind, file, existingUrl = '') {
  if (!file) {
    return existingUrl;
  }
  const client = getSupabaseClient();
  const safeCode = courseCode.replace(/[^a-zA-Z0-9_-]/g, '');
  const path = `${safeCode}/${kind}-${Date.now()}.pdf`;
  const { error } = await client.storage
    .from(COURSE_MATERIAL_BUCKET)
    .upload(path, file, { contentType: 'application/pdf', upsert: true });
  if (error) {
    throw error;
  }
  const { data } = client.storage.from(COURSE_MATERIAL_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function loadApplications() {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('applications')
    .select('id, full_name, email, department_code, status, generated_student_id, claimed, created_at')
    .order('created_at', { ascending: false });

  if (error) throw error;

  if (!data || data.length === 0) {
    appsListEl.innerHTML = '<li class="paper-item muted small">No applications yet.</li>';
    return;
  }

  appsListEl.innerHTML = data
    .map((app) => {
      const dateStr = new Date(app.created_at).toISOString().slice(0, 10);
      const idNote = app.generated_student_id
        ? ` · ID: ${escapeHtml(app.generated_student_id)}${app.claimed ? ' (active)' : ' (awaiting activation)'}`
        : '';

      return `
        <li class="paper-item">
          <div class="paper-item-meta">
            ${escapeHtml(dateStr)} &middot; ${escapeHtml(formatDepartmentName(app.department_code))} &middot; ${escapeHtml(app.status.toUpperCase())}${idNote}
          </div>
          <h3 class="paper-item-title">${escapeHtml(app.full_name)}</h3>
          <p class="paper-item-summary mono small">${escapeHtml(app.email)}</p>
          ${
            app.status === 'pending'
              ? `<div class="btn-row" style="margin-top:0.65rem;">
                  <button type="button" class="btn btn-sm approve-app-btn" data-app-id="${escapeHtml(app.id)}">Approve &amp; Generate ID</button>
                  <button type="button" class="btn btn-secondary btn-sm reject-app-btn" data-app-id="${escapeHtml(app.id)}">Reject</button>
                </div>`
              : ''
          }
        </li>
      `;
    })
    .join('');
}

async function loadCourses() {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('courses')
    .select('id, course_code, title, department_code, credit, outline, exam_question_url, assignments_url, solutions_url')
    .order('course_code', { ascending: true });

  if (error) throw error;
  coursesCache = data || [];

  if (coursesCache.length === 0) {
    adminCoursesList.innerHTML = '<li class="paper-item muted small">No courses added yet.</li>';
    return;
  }

  adminCoursesList.innerHTML = coursesCache
    .map((c) => {
      const mats = [];
      if (c.exam_question_url) mats.push(`<a href="${escapeHtml(c.exam_question_url)}" target="_blank" rel="noopener">Questions</a>`);
      if (c.assignments_url) mats.push(`<a href="${escapeHtml(c.assignments_url)}" target="_blank" rel="noopener">Assignments</a>`);
      if (c.solutions_url) mats.push(`<a href="${escapeHtml(c.solutions_url)}" target="_blank" rel="noopener">Solutions</a>`);

      return `
        <li class="paper-item">
          <div class="paper-item-meta">
            ${escapeHtml(c.course_code)} &middot; ${escapeHtml(formatDepartmentName(c.department_code))} &middot; ${escapeHtml(Number(c.credit).toFixed(1))} Credits
          </div>
          <h3 class="paper-item-title">${escapeHtml(c.title)}</h3>
          <p class="paper-item-summary">${escapeHtml(c.outline)}</p>
          ${mats.length ? `<div class="nav-links small" style="margin-top:0.4rem;">${mats.join('')}</div>` : ''}
          <div class="btn-row" style="margin-top:0.65rem;">
            <button type="button" class="btn btn-secondary btn-sm edit-course-btn" data-course-id="${escapeHtml(c.id)}">Edit</button>
            <button type="button" class="btn btn-secondary btn-sm delete-course-btn" data-course-id="${escapeHtml(c.id)}">Delete</button>
          </div>
        </li>
      `;
    })
    .join('');
}

async function loadEnrollments() {
  const client = getSupabaseClient();
  const [enrollRes, profRes] = await Promise.all([
    client
      .from('enrollments')
      .select('id, user_id, status, grade_point, letter_grade, courses(course_code, title, credit)')
      .order('created_at', { ascending: false }),
    client.from('profiles').select('id, student_id, full_name'),
  ]);

  if (enrollRes.error) throw enrollRes.error;
  if (profRes.error) throw profRes.error;

  const profileMap = new Map((profRes.data || []).map((p) => [p.id, p]));
  const rows = enrollRes.data || [];

  if (rows.length === 0) {
    enrollmentsList.innerHTML =
      '<li class="paper-item muted small">No student course enrollments yet.</li>';
    return;
  }

  enrollmentsList.innerHTML = rows
    .map((r) => {
      const prof = profileMap.get(r.user_id);
      const course = r.courses || {};
      const gpVal = r.grade_point === null ? '' : String(r.grade_point);
      return `
        <li class="paper-item">
          <div class="paper-item-meta">
            ID: ${escapeHtml(prof?.student_id || r.user_id)} ${prof?.full_name ? `(${escapeHtml(prof.full_name)})` : ''} &middot; ${escapeHtml(course.course_code || '')} (${escapeHtml(Number(course.credit || 0).toFixed(1))} cr) &middot; ${escapeHtml(r.status.toUpperCase())}
          </div>
          <h3 class="paper-item-title">${escapeHtml(course.title || '')}</h3>
          <div class="btn-row" style="margin-top:0.5rem;">
            <input
              type="number"
              step="0.01"
              min="0"
              max="4"
              value="${escapeHtml(gpVal)}"
              class="grade-point-input"
              data-enrollment-id="${escapeHtml(r.id)}"
              style="width: 120px;"
              aria-label="Grade point out of 4.00"
            >
            <button type="button" class="btn btn-sm save-grade-btn" data-enrollment-id="${escapeHtml(r.id)}">Save Grade</button>
          </div>
        </li>
      `;
    })
    .join('');
}

function resetCourseForm() {
  courseForm.reset();
  courseEditId.value = '';
  cCredit.value = '3.0';
  courseSubmit.textContent = 'Save Course';
  courseCancel.classList.add('hidden');
}

async function initAdmin() {
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
      setStatus('Access restricted: admin privileges required.', true);
      return;
    }

    adminIdLabel.textContent = `Admin ID: ${getDisplayStudentId(profile, user)}`;
    if (profile?.role !== 'admin') {
      setStatus(
        'Warning: profiles.role is not "admin" in Supabase. Database writes require role = "admin".',
        true
      );
    }

    contentEl.classList.remove('hidden');
    await Promise.all([loadApplications(), loadCourses(), loadEnrollments()]);
  } catch (err) {
    setStatus(err.message || 'Unable to load administration data.', true);
  }
}

appsListEl.addEventListener('click', async (event) => {
  const approveBtn = event.target.closest('.approve-app-btn');
  const rejectBtn = event.target.closest('.reject-app-btn');
  const client = getSupabaseClient();

  if (approveBtn) {
    setStatus('');
    approveBtn.disabled = true;
    try {
      const { data, error } = await client.rpc('approve_application', {
        p_app_id: approveBtn.dataset.appId,
      });
      if (error) throw error;
      setStatus(`Application approved. Generated Student ID: ${data}`);
      await loadApplications();
    } catch (err) {
      setStatus(err.message || 'Failed to approve application.', true);
      approveBtn.disabled = false;
    }
    return;
  }

  if (rejectBtn) {
    setStatus('');
    rejectBtn.disabled = true;
    try {
      const { error } = await client.rpc('reject_application', {
        p_app_id: rejectBtn.dataset.appId,
      });
      if (error) throw error;
      setStatus('Application rejected.');
      await loadApplications();
    } catch (err) {
      setStatus(err.message || 'Failed to reject application.', true);
      rejectBtn.disabled = false;
    }
  }
});

courseForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus('');

  const editId = courseEditId.value.trim();
  const code = cCode.value.trim().toUpperCase();
  const dept = cDept.value;
  const credit = Number(cCredit.value);
  const title = cTitle.value.trim();
  const outline = cOutline.value.trim();

  if (!code || !title || !outline || !(credit > 0)) {
    setStatus('Provide course code, title, credit, and outline.', true);
    return;
  }

  const existing = coursesCache.find((c) => c.id === editId);
  courseSubmit.disabled = true;
  courseSubmit.textContent = 'Saving...';

  try {
    const [qUrl, aUrl, sUrl] = await Promise.all([
      uploadPdf(code, 'questions', cQuestionsFile.files[0], existing?.exam_question_url || ''),
      uploadPdf(code, 'assignments', cAssignmentsFile.files[0], existing?.assignments_url || ''),
      uploadPdf(code, 'solutions', cSolutionsFile.files[0], existing?.solutions_url || ''),
    ]);

    const payload = {
      course_code: code,
      department_code: dept,
      credit,
      title,
      outline,
      exam_question_url: qUrl,
      assignments_url: aUrl,
      solutions_url: sUrl,
    };

    const client = getSupabaseClient();
    const { error } = editId
      ? await client.from('courses').update(payload).eq('id', editId)
      : await client.from('courses').insert(payload);

    if (error) throw error;

    resetCourseForm();
    setStatus(`Course ${code} saved.`);
    await loadCourses();
  } catch (err) {
    setStatus(err.message || 'Failed to save course.', true);
  } finally {
    courseSubmit.disabled = false;
    courseSubmit.textContent = editId ? 'Update Course' : 'Save Course';
  }
});

courseCancel.addEventListener('click', resetCourseForm);

adminCoursesList.addEventListener('click', async (event) => {
  const editBtn = event.target.closest('.edit-course-btn');
  const delBtn = event.target.closest('.delete-course-btn');

  if (editBtn) {
    const c = coursesCache.find((item) => item.id === editBtn.dataset.courseId);
    if (!c) return;
    courseEditId.value = c.id;
    cCode.value = c.course_code;
    cDept.value = c.department_code;
    cCredit.value = String(c.credit);
    cTitle.value = c.title;
    cOutline.value = c.outline;
    courseSubmit.textContent = 'Update Course';
    courseCancel.classList.remove('hidden');
    cCode.focus();
    return;
  }

  if (delBtn) {
    setStatus('');
    delBtn.disabled = true;
    try {
      const client = getSupabaseClient();
      const { error } = await client
        .from('courses')
        .delete()
        .eq('id', delBtn.dataset.courseId);
      if (error) throw error;
      setStatus('Course deleted.');
      await Promise.all([loadCourses(), loadEnrollments()]);
    } catch (err) {
      setStatus(err.message || 'Unable to delete course.', true);
      delBtn.disabled = false;
    }
  }
});

enrollmentsList.addEventListener('click', async (event) => {
  const btn = event.target.closest('.save-grade-btn');
  if (!btn) return;
  const id = btn.dataset.enrollmentId;
  const input = enrollmentsList.querySelector(
    `.grade-point-input[data-enrollment-id="${CSS.escape(id)}"]`
  );
  const raw = input?.value.trim() ?? '';
  const gp = raw === '' ? null : Number(raw);

  if (gp !== null && (Number.isNaN(gp) || gp < 0 || gp > 4)) {
    setStatus('Grade point must be between 0.00 and 4.00.', true);
    return;
  }

  setStatus('');
  btn.disabled = true;
  try {
    const client = getSupabaseClient();
    const { error } = await client
      .from('enrollments')
      .update({
        status: gp === null ? 'enrolled' : 'completed',
        grade_point: gp,
        letter_grade: gp === null ? '' : gradePointToLetter(gp),
      })
      .eq('id', id);

    if (error) throw error;
    setStatus('Grade updated.');
    await loadEnrollments();
  } catch (err) {
    setStatus(err.message || 'Unable to update grade.', true);
  } finally {
    btn.disabled = false;
  }
});

signOutBtn.addEventListener('click', async () => {
  await signOut();
  window.location.href = './index.html';
});

initAdmin();
