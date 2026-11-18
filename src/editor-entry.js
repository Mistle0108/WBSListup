import StarterKit from '@tiptap/starter-kit';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { MarkdownManager } from '@tiptap/markdown';
import { Marked } from 'marked';

const legacy = new MarkdownManager({ extensions: [StarterKit, TaskList, TaskItem] });
const escapeHtml = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const markdown = new Marked({
  gfm: true,
  renderer: {
    html({ text }) {
      // Tiptap serializes underlines as HTML because Markdown has no underline syntax.
      return /^<\/?u>$/i.test(text) ? text : escapeHtml(text);
    },
    link({ href, tokens }) {
      return /^(https?:|mailto:)/i.test(href) ? false : this.parser.parseInline(tokens);
    },
    image({ href, text }) {
      return /^https?:/i.test(href) ? false : escapeHtml(text);
    }
  }
});

window.toDocumentMarkdown = (content, version) => {
  if (version === 2 && typeof content === 'string') return content.replace(/\r\n?/g, '\n');
  if (version === 1 && content?.type === 'doc') return legacy.serialize(content);
  throw new Error('지원하지 않는 문서 형식입니다.');
};

window.renderDocumentMarkdown = (element, source) => {
  element.classList.add('markdown-preview');
  element.innerHTML = markdown.parse(source);
  // Keep document links from navigating the app window.
  element.onclick = event => { if (event.target.closest('a')) event.preventDefault(); };
  element.onauxclick = element.onclick;
};

function setMarkdownPreview(input, showPreview) {
  const preview = input.nextElementSibling;
  if (showPreview) window.renderDocumentMarkdown(preview, input.value);
  preview.hidden = !showPreview;
  input.hidden = showPreview;
}

window.bindMarkdownMode = (toggle, container, signal, showPreview, onChange) => {
  toggle.setAttribute('aria-pressed', String(showPreview));
  toggle.addEventListener('click', () => {
    showPreview = !showPreview;
    toggle.setAttribute('aria-pressed', String(showPreview));
    for (const input of container.querySelectorAll('.markdown-source')) {
      setMarkdownPreview(input, showPreview);
    }
    onChange(showPreview);
  }, { signal });
  return () => showPreview;
};

window.createMarkdownEditor = (element, source, showPreview) => {
  const input = document.createElement('textarea');
  input.className = 'markdown-source';
  input.setAttribute('aria-label', 'Markdown 문서 편집');
  input.placeholder = 'Markdown으로 작성';
  input.value = source;
  const preview = document.createElement('div');
  element.append(input, preview);
  setMarkdownPreview(input, showPreview);
  return input;
};
