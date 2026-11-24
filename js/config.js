// IAM Configuration
// Replace SUPABASE_URL and SUPABASE_ANON_KEY with your Supabase project's values.
// Never place a service_role key in client-side code.

export const SUPABASE_URL = 'https://tiycpskxwxyraonikjnl.supabase.co/rest/v1/';
export const SUPABASE_ANON_KEY = 'sb_publishable_d-NGdwqv3wcYpUHSCJhZGw_utuVV8kf';

// Student IDs without '@' are mapped to <lowercase-id>@<ID_EMAIL_DOMAIN>
export const ID_EMAIL_DOMAIN = 'iam.local';

// Admin IDs allowed to access the blog writer (alongside profiles.role === 'admin')
export const ADMIN_IDS = ['admin'];

// GitHub repository where blog posts are stored and published
export const GITHUB_REPO = {
  owner: 'turin-code',
  repo: 'IAM',
  branch: 'main',
  postsDir: 'posts',
  indexPath: 'posts/index.json',
};

