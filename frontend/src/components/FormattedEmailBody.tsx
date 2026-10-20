import React, { useMemo } from 'react';

interface FormattedEmailBodyProps {
  body: string;
}

function parseMarkdownToHtml(raw: string): string {
  if (!raw) return '';

  let html = raw
    // Escape standard HTML special characters first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks: ```lang\ncode\n```
  html = html.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    return `<pre class="my-2 p-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-mono overflow-x-auto"><code class="language-${lang}">${code.trim()}</code></pre>`;
  });

  // Inline code: `code`
  html = html.replace(/`([^`\n]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-purple-600 dark:text-purple-300 font-mono text-[11px]">$1</code>');

  // Headings: ###, ##, #
  html = html.replace(/^### (.*$)/gim, '<h3 class="text-sm font-bold text-slate-900 dark:text-white mt-3 mb-1.5">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="text-base font-bold text-slate-900 dark:text-white mt-4 mb-2">$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1 class="text-lg font-extrabold text-slate-900 dark:text-white mt-4 mb-2.5">$1</h1>');

  // Markdown links: [text](url)
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-brand-purple hover:underline font-semibold">$1</a>');

  // Raw URLs not inside an href
  html = html.replace(/(^|[^"'])(https?:\/\/[^\s&<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer" class="text-brand-purple hover:underline break-all">$2</a>');

  // Bold + Italic: ***text***
  html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong class="font-bold"><em class="italic">$1</em></strong>');

  // Bold: **text** or __text__
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-slate-900 dark:text-white">$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong class="font-bold text-slate-900 dark:text-white">$1</strong>');

  // Italic: *text* or _text_
  html = html.replace(/\*([^\*\n]+)\*/g, '<em class="italic">$1</em>');
  html = html.replace(/_([^_\n]+)_/g, '<em class="italic">$1</em>');

  // Strikethrough: ~~text~~
  html = html.replace(/~~(.*?)~~/g, '<del class="line-through text-slate-400">$1</del>');

  // Process paragraphs & blockquotes & lists:
  const lines = html.split('\n');
  const result: string[] = [];
  let inList = false;
  let inBlockquote = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blockquote
    if (trimmed.startsWith('&gt;')) {
      if (!inBlockquote) {
        result.push('<blockquote class="border-l-2 border-purple-400 dark:border-purple-600 pl-3 my-2 text-slate-600 dark:text-slate-300 italic">');
        inBlockquote = true;
      }
      result.push(`<p class="leading-relaxed">${trimmed.replace(/^&gt;\s?/, '')}</p>`);
      continue;
    } else if (inBlockquote) {
      result.push('</blockquote>');
      inBlockquote = false;
    }

    // List item (- or *)
    if (/^[-*]\s+(.*)/.test(trimmed)) {
      if (!inList) {
        result.push('<ul class="list-disc pl-5 my-2 space-y-1">');
        inList = true;
      }
      result.push(`<li>${trimmed.replace(/^[-*]\s+/, '')}</li>`);
      continue;
    } else if (inList) {
      result.push('</ul>');
      inList = false;
    }

    // Blank line
    if (!trimmed) {
      result.push('<div class="h-2"></div>');
      continue;
    }

    // Regular line / paragraph
    result.push(`<p class="mb-1 leading-relaxed">${line}</p>`);
  }

  if (inBlockquote) result.push('</blockquote>');
  if (inList) result.push('</ul>');

  return result.join('\n');
}

export const FormattedEmailBody: React.FC<FormattedEmailBodyProps> = ({ body }) => {
  const isHtml = useMemo(() => {
    if (!body) return false;
    const lower = body.toLowerCase();
    return (
      lower.includes('<html') ||
      lower.includes('<!doctype') ||
      (lower.includes('<div') && lower.includes('</div>')) ||
      (lower.includes('<p>') && lower.includes('</p>'))
    );
  }, [body]);

  if (!body) {
    return <div className="text-xs text-slate-400 italic">No content available.</div>;
  }

  // If email is already full HTML format (e.g. from Gmail)
  if (isHtml) {
    return (
      <div
        className="email-html-body text-xs sm:text-sm leading-relaxed text-slate-800 dark:text-slate-200 overflow-x-auto max-w-full [&_a]:text-brand-purple [&_a]:underline [&_a]:break-all [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
        dangerouslySetInnerHTML={{ __html: body }}
      />
    );
  }

  // Parse plain text and Markdown into formatted HTML
  const parsedHtml = parseMarkdownToHtml(body);

  return (
    <div
      className="formatted-email-markdown text-xs sm:text-sm leading-relaxed text-slate-800 dark:text-slate-200"
      dangerouslySetInnerHTML={{ __html: parsedHtml }}
    />
  );
};

export default FormattedEmailBody;
