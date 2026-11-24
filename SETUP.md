# IAM Setup Guide (Supabase + GitHub Pages)

## 1. Configure Supabase

1. Create a new Supabase project.
2. Open **SQL Editor** and run [`supabase/schema.sql`](supabase/schema.sql).
3. Open **Authentication → Providers → Email**:
   - Optionally disable **Confirm email** if you want approved students activating on `apply.html` to sign in immediately without clicking an email link.
4. Open **Authentication → URL Configuration**:
   - **Site URL:** `https://turin-code.github.io/IAM/`
   - **Redirect URLs:** add `http://localhost:8080/*` and `https://turin-code.github.io/IAM/*`.
5. Create admin / initial users in **Authentication → Users → Add user**:
   - Student IDs use the 7-digit format `YYPPRRR` (`2601001` = 2026, `01` BSc in Analytical Machines, roll `001`; `2610001` = 2026, `10` BSc in Computer Science, roll `001`).
   - Students apply on `apply.html` with their real email, get approved in `admin.html` (which auto-generates their ID), and activate their account using their application email while logging in with their Student ID (`resolve_login_email`).
   - To promote your admin user (`admin@iam.local` or your admin email with `student_id = 'admin'`), run in SQL Editor:
     ```sql
     update public.profiles
     set role = 'admin'
     where lower(student_id) = 'admin';
     ```

## 2. Connect Frontend to Supabase

Edit `js/config.js` and fill in your **Project URL** and **Anon / Publishable Key** from **Project Settings → API**:

```js
export const SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR_PUBLIC_ANON_KEY';
```

## 3. Publishing Blogs to GitHub as Admin

1. Sign in on `index.html` using an account whose `profiles.role` is `'admin'` (or listed in `ADMIN_IDS` in `js/config.js`).
2. Open **Admin Writer** (`write.html`).
3. Write the title, slug, summary, and Markdown content.
4. Click **Publish to GitHub Repo** and paste a GitHub Fine-Grained Personal Access Token (scoped to `turin-code/IAM` with **Contents: Read and write** permission).
   - The token stays only in your browser session and is never saved in the repository.
   - It commits `posts/<slug>.md` and updates `posts/index.json` directly on `main`.
   - You can also click **Download Files** to commit them manually with `git`.

## 4. Deploy on GitHub Pages

1. Commit and push all files to `main`.
2. In GitHub: **Settings → Pages → Build and deployment**:
   - **Source:** Deploy from a branch
   - **Branch:** `main` / `/ (root)`
3. Visit `https://turin-code.github.io/IAM/`.

