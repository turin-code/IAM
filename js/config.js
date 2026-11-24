// IAM Configuration
// Replace SUPABASE_URL and SUPABASE_ANON_KEY with your Supabase project's values.
// Never place a service_role key in client-side code.

export const SUPABASE_URL = 'https://tiycpskxwxyraonikjnl.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeWNwc2t4d3h5cmFvbmlram5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU1MzU1ODQsImV4cCI6MjExMTExMTU4NH0.-kkhGovVpQiw6_mJJIHRjzrFoL-O0t-fyz8MY_fiykk';

// Student IDs without '@' are mapped to <lowercase-id>@<ID_EMAIL_DOMAIN>
// Standard student ID format: YYPPRRR (e.g. 2601001 -> 2026, program 01, roll 001)
export const ID_EMAIL_DOMAIN = 'iam.local';

export const PROGRAM_CODES = {
  '01': 'BSc in Analytical Machines',
  '10': 'BSc in Computer Science',
};

export const COURSE_MATERIAL_BUCKET = 'course-materials';

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

