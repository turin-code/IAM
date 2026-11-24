import { PROGRAM_CODES } from './config.js';
import {
  getSupabaseClient,
  isSupabaseConfigured,
} from './supabase-client.js';

const applyForm = document.getElementById('apply-form');
const nameInput = document.getElementById('apply-name');
const emailInput = document.getElementById('apply-email');
const deptSelect = document.getElementById('apply-dept');
const applySubmit = document.getElementById('apply-submit');
const applyStatus = document.getElementById('apply-status');

const checkForm = document.getElementById('check-form');
const checkEmailInput = document.getElementById('check-email');
const checkSubmit = document.getElementById('check-submit');
const checkStatus = document.getElementById('check-status');

const activateForm = document.getElementById('activate-form');
const assignedIdEl = document.getElementById('assigned-id');
const assignedDeptEl = document.getElementById('assigned-dept');
const activatePasswordInput = document.getElementById('activate-password');
const activateSubmit = document.getElementById('activate-submit');
const activateStatus = document.getElementById('activate-status');

let approvedRecord = null;

function setStatus(el, message, isError = false) {
  el.textContent = message;
  el.classList.toggle('error', isError);
}

applyForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(applyStatus, '');

  if (!isSupabaseConfigured()) {
    setStatus(applyStatus, 'Supabase is not configured in js/config.js.', true);
    return;
  }

  const fullName = nameInput.value.trim();
  const email = emailInput.value.trim().toLowerCase();
  const deptCode = deptSelect.value;

  if (!fullName || !email || !email.includes('@')) {
    setStatus(applyStatus, 'Enter your full name and a valid email address.', true);
    return;
  }

  applySubmit.disabled = true;
  applySubmit.textContent = 'Submitting...';
  try {
    const client = getSupabaseClient();
    const { error } = await client.from('applications').insert({
      full_name: fullName,
      email,
      department_code: deptCode,
    });
    if (error) {
      throw error;
    }

    applyForm.reset();
    checkEmailInput.value = email;
    setStatus(
      applyStatus,
      `Application submitted for ${PROGRAM_CODES[deptCode] || deptCode}. Check status below once reviewed by an admin.`
    );
  } catch (err) {
    setStatus(applyStatus, err.message || 'Unable to submit application.', true);
  } finally {
    applySubmit.disabled = false;
    applySubmit.textContent = 'Submit Application';
  }
});

checkForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(checkStatus, '');
  setStatus(activateStatus, '');
  activateForm.classList.add('hidden');
  approvedRecord = null;

  if (!isSupabaseConfigured()) {
    setStatus(checkStatus, 'Supabase is not configured in js/config.js.', true);
    return;
  }

  const email = checkEmailInput.value.trim().toLowerCase();
  if (!email) {
    setStatus(checkStatus, 'Enter your application email address.', true);
    return;
  }

  checkSubmit.disabled = true;
  checkSubmit.textContent = 'Checking...';
  try {
    const client = getSupabaseClient();
    const { data, error } = await client.rpc('check_application_status', {
      p_email: email,
    });
    if (error) {
      throw error;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      setStatus(checkStatus, 'No application found for that email address.');
      return;
    }

    const deptLabel = PROGRAM_CODES[row.department_code] || row.department_code;
    if (row.status === 'pending') {
      setStatus(checkStatus, `Application for ${deptLabel} is pending admin approval.`);
      return;
    }
    if (row.status === 'rejected') {
      setStatus(checkStatus, `Application for ${deptLabel} was not approved.`, true);
      return;
    }

    if (row.status === 'approved' && row.generated_student_id) {
      if (row.claimed) {
        setStatus(
          checkStatus,
          `Approved. Student ID ${row.generated_student_id} (${deptLabel}) is already active — sign in on the Login page.`
        );
      } else {
        approvedRecord = { ...row, email };
        assignedIdEl.textContent = row.generated_student_id;
        assignedDeptEl.textContent = deptLabel;
        activateForm.classList.remove('hidden');
        setStatus(
          checkStatus,
          `Approved. Your Student ID is ${row.generated_student_id}. Set a password below to activate.`
        );
      }
    }
  } catch (err) {
    setStatus(checkStatus, err.message || 'Could not check status.', true);
  } finally {
    checkSubmit.disabled = false;
    checkSubmit.textContent = 'Check Status';
  }
});

activateForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(activateStatus, '');

  if (!approvedRecord?.generated_student_id) {
    return;
  }

  const password = activatePasswordInput.value;
  if (password.length < 6) {
    setStatus(activateStatus, 'Password must be at least 6 characters.', true);
    return;
  }

  activateSubmit.disabled = true;
  activateSubmit.textContent = 'Activating...';
  try {
    const client = getSupabaseClient();
    const { data, error } = await client.auth.signUp({
      email: approvedRecord.email,
      password,
      options: {
        data: {
          student_id: approvedRecord.generated_student_id,
          full_name: approvedRecord.full_name,
          department_code: approvedRecord.department_code,
          contact_email: approvedRecord.email,
        },
      },
    });
    if (error) {
      throw error;
    }

    activateForm.classList.add('hidden');
    if (data?.session) {
      setStatus(
        activateStatus,
        `Activated Student ID ${approvedRecord.generated_student_id}. Redirecting to Portal...`
      );
      setTimeout(() => {
        window.location.href = './portal.html';
      }, 800);
    } else {
      setStatus(
        activateStatus,
        `Account created for Student ID ${approvedRecord.generated_student_id}. Check ${approvedRecord.email} if email confirmation is enabled, then sign in with ID ${approvedRecord.generated_student_id}.`
      );
    }
  } catch (err) {
    setStatus(activateStatus, err.message || 'Activation failed.', true);
  } finally {
    activateSubmit.disabled = false;
    activateSubmit.textContent = 'Activate Student ID';
  }
});

