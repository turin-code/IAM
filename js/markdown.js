/**
 * Escapes HTML special characters to prevent XSS.
 */
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInline(text) {
  let out = escapeHtml(text);
  // Inline code first so formatting inside backticks is left literal
  const codeSegments = [];
  out = out.replace(/`([^`]+)`/g, (_, code) => {
    const token = `\u0000CODE${codeSegments.length}\u0000`;
    codeSegments.push(`<code>${code}</code>`);
    return token;
  });

  // Links: [label](https://... or ./...)
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
    const safeUrl = /^(https?:\/\/|\.\/|\.\.\/|#)/i.test(url) ? url : '#';
    return `<a href="${safeUrl}">${label}</a>`;
  });

  // Bold and italic
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Restore inline code
  out = out.replace(/\u0000CODE(\d+)\u0000/g, (_, idx) => codeSegments[Number(idx)]);
  return out;
}

/**
 * Lightweight Markdown-to-HTML renderer for technical papers/blogs.
 */
export function renderMarkdown(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let inCodeBlock = false;
  let codeLines = [];
  let listType = null;
  let paragraphLines = [];

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      html.push(`<p>${renderInline(paragraphLines.join(' '))}</p>`);
      paragraphLines = [];
    }
  };

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const rawLine of lines) {
    if (rawLine.trim().startsWith('```')) {
      flushParagraph();
      closeList();
      if (inCodeBlock) {
        html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(rawLine);
      continue;
    }

    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      flushParagraph();
      closeList();
      html.push('<hr>');
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      closeList();
      const level = Math.min(headingMatch[1].length + 1, 4); // h2..h4 inside article
      html.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`);
      continue;
    }

    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      flushParagraph();
      closeList();
      html.push(`<blockquote><p>${renderInline(quoteMatch[1])}</p></blockquote>`);
      continue;
    }

    const ulMatch = line.match(/^[-*]\s+(.+)$/);
    if (ulMatch) {
      flushParagraph();
      if (listType !== 'ul') {
        closeList();
        listType = 'ul';
        html.push('<ul>');
      }
      html.push(`<li>${renderInline(ulMatch[1])}</li>`);
      continue;
    }

    const olMatch = line.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      flushParagraph();
      if (listType !== 'ol') {
        closeList();
        listType = 'ol';
        html.push('<ol>');
      }
      html.push(`<li>${renderInline(olMatch[1])}</li>`);
      continue;
    }

    closeList();
    paragraphLines.push(line.trim());
  }

  if (inCodeBlock && codeLines.length > 0) {
    html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  }
  flushParagraph();
  closeList();

  return html.join('\n');
}

