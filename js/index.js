import {
  getDisplayStudentId,
  getSessionAndProfile,
  isAdminUser,
  isSupabaseConfigured,
  signInWithStudentId,
  signOut,
} from './supabase-client.js';

const loginForm = document.getElementById('login-form');
const studentIdInput = document.getElementById('student-id');
const passwordInput = document.getElementById('password');
const loginSubmit = document.getElementById('login-submit');
const statusBox = document.getElementById('auth-status');

const activeBox = document.getElementById('active-session-box');
const activeIdEl = document.getElementById('active-student-id');
const activeRoleEl = document.getElementById('active-role');
const activeAdminLink = document.getElementById('active-admin-link');
const signOutBtn = document.getElementById('signout-btn');

function setStatus(message, isError = false) {
  statusBox.textContent = message;
  statusBox.classList.toggle('error', isError);
}

async function refreshSessionView() {
  if (!isSupabaseConfigured()) {
    setStatus('Setup pending: add SUPABASE_URL and SUPABASE_ANON_KEY in js/config.js.');
    return;
  }

  try {
    const { user, profile } = await getSessionAndProfile();
    if (user) {
      const displayId = getDisplayStudentId(profile, user);
      const admin = isAdminUser(profile, user);
      activeIdEl.textContent = displayId;
      activeRoleEl.textContent = admin ? 'admin' : 'student';
      activeAdminLink.classList.toggle('hidden', !admin);
      activeBox.classList.remove('hidden');
      loginForm.classList.add('hidden');
    } else {
      activeBox.classList.add('hidden');
      loginForm.classList.remove('hidden');
    }
  } catch (err) {
    setStatus(err.message || 'Unable to verify current session.', true);
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus('');

  const studentId = studentIdInput.value.trim();
  const password = passwordInput.value;
  if (!studentId || !password) {
    setStatus('Enter both Student ID and Password.', true);
    return;
  }

  loginSubmit.disabled = true;
  loginSubmit.textContent = 'Authenticating...';
  try {
    await signInWithStudentId(studentId, password);
    window.location.href = './portal.html';
  } catch (err) {
    setStatus(err.message || 'Authentication failed.', true);
    loginSubmit.disabled = false;
    loginSubmit.textContent = 'Sign In';
  }
});

signOutBtn.addEventListener('click', async () => {
  try {
    await signOut();
    setStatus('Signed out.');
    await refreshSessionView();
  } catch (err) {
    setStatus(err.message || 'Failed to sign out.', true);
  }
});

refreshSessionView();

