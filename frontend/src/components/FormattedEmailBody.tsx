import React, { useMemo } from 'react';

interface FormattedEmailBodyProps {
  body: string;
}

/**
 * Strips Outlook conditional comments, VML markup, Office XML tags,
 * and recovers any mangled link artifacts.
 */
export function cleanEmailRaw(text: string): string {
  if (!text) return '';

  let cleaned = text
    // 1. Remove Outlook MSO conditional blocks: <!--[if mso]>...<![endif]-->
    .replace(/<!--\[if\s+(?:gte\s+)?mso[\s\S]*?<!\[endif\]-->/gi, '')
    // 2. Remove standalone conditional comments: <!--[if !mso]><!-->, <!--[if false]><!-->, etc.
    .replace(/<!--\[if[^>]*-->/gi, '')
    .replace(/<!--\[if[^\]]*\]>/gi, '')
    .replace(/<!--<!\[endif\]-->/gi, '')
    .replace(/<!\[endif\]-->/gi, '')
    // 3. Remove standard HTML comments <!-- ... -->
    .replace(/<!--[\s\S]*?-->/g, '')
    // 4. Remove VML and Office XML tags (<v:...>, <w:...>, <o:...>)
    .replace(/<\/?(?:v|w|o|m|x):[^>]*>/gi, '')
    .replace(/<\?xml[^>]*\?>/gi, '')
    // 5. Clean mangled link artifacts <[...](...)>
    .replace(/<\[([\s\S]*?)\]\((https?:\/\/[^\s)]+)\)>/g, (_m, label, url) => {
      const urlMatch = label.match(/https?:\/\/[^\s"'<>]+/);
      const targetUrl = urlMatch ? urlMatch[0] : url.replace(/%3Cem%20class=/gi, '').trim();
      return `<${targetUrl}>`;
    })
    // 6. Clean stale literal placeholder tokens like "( LINK_BLOCK_0 )" or "LINK_BLOCK_1"
    .replace(/\(?\s*LINK_BLOCK_\d+\s*\)?/gi, '');

  return cleaned;
}

function parseMarkdownToHtml(raw: string): string {
  if (!raw) return '';

  let text = cleanEmailRaw(raw);

  // 1. Preserve Code blocks with collision-proof token
  const codeBlocks: string[] = [];
  text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(
      `<pre class="my-2 p-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-mono overflow-x-auto"><code class="language-${lang}">${code.trim()}</code></pre>`
    );
    return `@@PH_CODE_${idx}_TOKEN@@`;
  });

  // 2. Preserve Links (Markdown links and Autolinks) with collision-proof token
  const links: string[] = [];
  function saveLink(label: string, url: string): string {
    const idx = links.length;
    const cleanUrl = url.replace(/%3Cem%20class=/gi, '').trim();
    let display = label.trim();
    // Shorten excessively long tracking URLs for clean readable UI
    if (display.length > 55 && (display.startsWith('http://') || display.startsWith('https://'))) {
      display = display.slice(0, 40) + '...' + display.slice(-10);
    }
    links.push(
      `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="text-brand-purple hover:underline break-all font-medium">${display}</a>`
    );
    return `@@PH_LINK_${idx}_TOKEN@@`;
  }

  // Markdown links: [label](url)
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, label, url) => saveLink(label, url));

  // Autolinks: <https://...>
  text = text.replace(/<((?:https?:\/\/)[^\s>]+)>/g, (_m, url) => saveLink(url, url));

  // Parentheses URLs: ( https://... )
  text = text.replace(/\(\s*(https?:\/\/[^\s)]+)\s*\)/g, (_m, url) => `(${saveLink(url, url)})`);

  // Standalone Raw URLs (not preceded by href= or quotation)
  text = text.replace(/(?<![="'>/])\bhttps?:\/\/[^\s<>\(\)]+/g, (url) => saveLink(url, url));

  // 3. Escape HTML characters in remaining text
  text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 4. Headings: ###, ##, #
  text = text.replace(/^### (.*$)/gim, '<h3 class="text-sm font-bold text-slate-900 dark:text-white mt-3 mb-1.5">$1</h3>');
  text = text.replace(/^## (.*$)/gim, '<h2 class="text-base font-bold text-slate-900 dark:text-white mt-4 mb-2">$1</h2>');
  text = text.replace(/^# (.*$)/gim, '<h1 class="text-lg font-extrabold text-slate-900 dark:text-white mt-4 mb-2.5">$1</h1>');

  // 5. Horizontal rules: *** or --- or ___
  text = text.replace(/^\s*(\*\*\*|---|___)\s*$/gm, '<hr class="my-3 border-slate-200 dark:border-slate-800" />');

  // 6. Inline code: `code`
  text = text.replace(/`([^`\n]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-purple-600 dark:text-purple-300 font-mono text-[11px]">$1</code>');

  // 7. Bold: **text** or __text__
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-slate-900 dark:text-white">$1</strong>');
  text = text.replace(/(^|[^\w])__(.*?)__([^\w]|$)/g, '$1<strong class="font-bold text-slate-900 dark:text-white">$2</strong>$3');

  // 8. Italic: require non-word boundaries so underscores inside words or URLs are NEVER converted
  text = text.replace(/(^|[^\w])\*([^\*\n]+)\*([^\w]|$)/g, '$1<em class="italic">$2</em>$3');
  text = text.replace(/(^|[^\w])_([^_\n]+)_([^\w]|$)/g, '$1<em class="italic">$2</em>$3');

  // 9. Strikethrough: ~~text~~
  text = text.replace(/~~(.*?)~~/g, '<del class="line-through text-slate-400">$1</del>');

  // 10. Restore Links and Code Blocks using safe replaceAll
  for (let i = 0; i < links.length; i++) {
    text = text.replaceAll(`@@PH_LINK_${i}_TOKEN@@`, links[i]);
  }
  for (let i = 0; i < codeBlocks.length; i++) {
    text = text.replaceAll(`@@PH_CODE_${i}_TOKEN@@`, codeBlocks[i]);
  }

  // 11. Process paragraphs & blockquotes & lists
  const lines = text.split('\n');
  const cleanedLines: string[] = [];

  for (const l of lines) {
    const s = l.trim();
    if (!s) {
      if (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1] !== '') {
        cleanedLines.push('');
      }
      continue;
    }
    // Deduplicate consecutive identical lines (from fallback templates)
    if (cleanedLines.length > 0 && s === cleanedLines[cleanedLines.length - 1]) {
      continue;
    }
    cleanedLines.push(s);
  }

  const result: string[] = [];
  let inList = false;
  let inBlockquote = false;

  for (let i = 0; i < cleanedLines.length; i++) {
    const line = cleanedLines[i];

    if (!line) {
      if (inBlockquote) { result.push('</blockquote>'); inBlockquote = false; }
      if (inList) { result.push('</ul>'); inList = false; }
      result.push('<div class="h-2"></div>');
      continue;
    }

    // Preserve horizontal rules directly
    if (line.includes('<hr class=')) {
      if (inBlockquote) { result.push('</blockquote>'); inBlockquote = false; }
      if (inList) { result.push('</ul>'); inList = false; }
      result.push(line);
      continue;
    }

    // Blockquote
    if (line.startsWith('&gt;')) {
      if (!inBlockquote) {
        result.push('<blockquote class="border-l-2 border-purple-400 dark:border-purple-600 pl-3 my-2 text-slate-600 dark:text-slate-300 italic">');
        inBlockquote = true;
      }
      result.push(`<p class="leading-relaxed">${line.replace(/^&gt;\s?/, '')}</p>`);
      continue;
    } else if (inBlockquote) {
      result.push('</blockquote>');
      inBlockquote = false;
    }

    // List item (- or *)
    if (/^[-*]\s+(.*)/.test(line)) {
      if (!inList) {
        result.push('<ul class="list-disc pl-5 my-2 space-y-1">');
        inList = true;
      }
      result.push(`<li>${line.replace(/^[-*]\s+/, '')}</li>`);
      continue;
    } else if (inList) {
      result.push('</ul>');
      inList = false;
    }

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
      lower.includes('<table') ||
      lower.includes('<tbody') ||
      lower.includes('<thead') ||
      lower.includes('<tr') ||
      lower.includes('<td') ||
      lower.includes('<div') ||
      lower.includes('<p>') ||
      lower.includes('</p>') ||
      lower.includes('<p ') ||
      lower.includes('<span') ||
      lower.includes('<br/>') ||
      lower.includes('<br>') ||
      lower.includes('<br />') ||
      lower.includes('<img') ||
      lower.includes('<a href') ||
      lower.includes('<body') ||
      lower.includes('<style')
    );
  }, [body]);

  const sanitizedBody = useMemo(() => {
    if (!body) return '';
    return cleanEmailRaw(body);
  }, [body]);

  if (!body) {
    return <div className="text-xs text-slate-400 italic">No content available.</div>;
  }

  // If email has rich HTML format (with styling, tables, images)
  if (isHtml) {
    return (
      <div
        className="email-html-body text-xs sm:text-sm leading-relaxed text-slate-900 dark:text-slate-100 overflow-x-auto max-w-full [&_img]:max-w-full [&_img]:h-auto [&_img]:inline-block [&_table]:max-w-full [&_a]:text-brand-purple [&_a:not([style])]:underline [&_a:hover]:underline"
        dangerouslySetInnerHTML={{ __html: sanitizedBody }}
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
