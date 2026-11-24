import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {
  ADMIN_IDS,
  ID_EMAIL_DOMAIN,
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
} from './config.js';

let cachedClient = null;

/**
 * Returns whether Supabase credentials have been configured in js/config.js.
 */
export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/**
 * Returns a singleton Supabase client, or null if not yet configured.
 */
export function getSupabaseClient() {
  if (!isSupabaseConfigured()) {
    return null;
  }
  if (!cachedClient) {
    cachedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return cachedClient;
}

/**
 * Converts a Student ID (or full email) to the auth email used by Supabase.
 */
export function studentIdToEmail(rawId) {
  const trimmed = rawId.trim().toLowerCase();
  if (!trimmed) {
    return '';
  }
  if (trimmed.includes('@')) {
    return trimmed;
  }
  return `${trimmed}@${ID_EMAIL_DOMAIN}`;
}

/**
 * Extracts a displayable Student ID from a Supabase profile or auth user.
 */
export function getDisplayStudentId(profile, user) {
  if (profile?.student_id) {
    return profile.student_id;
  }
  const email = user?.email || '';
  return email.includes('@') ? email.split('@')[0] : email;
}

/**
 * Returns true if the signed-in user holds admin privileges.
 */
export function isAdminUser(profile, user) {
  if (profile?.role === 'admin') {
    return true;
  }
  const id = getDisplayStudentId(profile, user).toLowerCase();
  return ADMIN_IDS.map((item) => item.toLowerCase()).includes(id);
}

/**
 * Signs in with a Student ID (or email) and password.
 */
export async function signInWithStudentId(studentId, password) {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase is not configured. Update js/config.js first.');
  }
  const email = studentIdToEmail(studentId);
  if (!email || !password) {
    throw new Error('Enter both Student ID and password.');
  }
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw error;
  }
  return data;
}

/**
 * Signs out the active user.
 */
export async function signOut() {
  const client = getSupabaseClient();
  if (!client) {
    return;
  }
  const { error } = await client.auth.signOut();
  if (error) {
    throw error;
  }
}

/**
 * Fetches the active session and matching row from public.profiles (if available).
 */
export async function getSessionAndProfile() {
  const client = getSupabaseClient();
  if (!client) {
    return { configured: false, session: null, user: null, profile: null };
  }

  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) {
    throw sessionError;
  }

  const session = sessionData?.session || null;
  const user = session?.user || null;
  if (!user) {
    return { configured: true, session: null, user: null, profile: null };
  }

  const { data: profile } = await client
    .from('profiles')
    .select('id, student_id, full_name, role, created_at')
    .eq('id', user.id)
    .maybeSingle();

  return {
    configured: true,
    session,
    user,
    profile: profile || null,
  };
}

