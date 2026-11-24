import { GITHUB_REPO } from './config.js';

/**
 * Converts a title into a URL-safe filename slug.
 */
export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function encodeUtf8Base64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

function decodeUtf8Base64(base64) {
  const clean = base64.replace(/\s/g, '');
  const binary = atob(clean);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function githubRequest(path, token, options = {}) {
  const { owner, repo } = GITHUB_REPO;
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(payload.message || `GitHub API error (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return payload;
}

async function getFileIfExists(path, token) {
  const { branch } = GITHUB_REPO;
  try {
    return await githubRequest(`${path}?ref=${encodeURIComponent(branch)}`, token, {
      method: 'GET',
    });
  } catch (err) {
    if (err.status === 404) {
      return null;
    }
    throw err;
  }
}

async function putFile(path, content, message, token, sha = undefined) {
  const body = {
    message,
    content: encodeUtf8Base64(content),
    branch: GITHUB_REPO.branch,
  };
  if (sha) {
    body.sha = sha;
  }
  return githubRequest(path, token, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/**
 * Inserts or replaces a post entry in the blog index, sorted newest-first.
 */
export function upsertPostIndex(existingPosts, entry) {
  const posts = Array.isArray(existingPosts) ? existingPosts : [];
  const updated = [entry, ...posts.filter((p) => p.slug !== entry.slug)];
  updated.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return updated;
}

/**
 * Publishes (or updates) a Markdown blog post and updates posts/index.json
 * directly in the configured GitHub repository.
 */
export async function publishPostToGitHub({
  token,
  slug,
  title,
  summary,
  authorId,
  date,
  markdown,
}) {
  const cleanToken = token.trim();
  if (!cleanToken) {
    throw new Error('A GitHub Personal Access Token is required to commit to the repository.');
  }

  const postPath = `${GITHUB_REPO.postsDir}/${slug}.md`;
  const existingPost = await getFileIfExists(postPath, cleanToken);
  await putFile(
    postPath,
    markdown,
    `Publish blog post: ${title} (${slug})`,
    cleanToken,
    existingPost?.sha
  );

  // Update posts/index.json from the live GitHub file so concurrent edits aren't clobbered.
  const indexFile = await getFileIfExists(GITHUB_REPO.indexPath, cleanToken);
  let posts = [];
  if (indexFile?.content) {
    posts = JSON.parse(decodeUtf8Base64(indexFile.content));
  }

  const entry = { slug, title, summary, authorId, date };
  const updatedPosts = upsertPostIndex(posts, entry);

  await putFile(
    GITHUB_REPO.indexPath,
    `${JSON.stringify(updatedPosts, null, 2)}\n`,
    `Update blog index for ${slug}`,
    cleanToken,
    indexFile?.sha
  );

  return { postPath, entry, updatedPosts };
}
