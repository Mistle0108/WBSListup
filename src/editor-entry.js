import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TaskList, TaskItem } from '@tiptap/extension-list';

const safeLink = url => /^(https?:|mailto:)/i.test(url);
window.createTaskEditor = (element, content) => new Editor({
  element,
  extensions: [StarterKit.configure({link: {openOnClick:false, autolink:true, isAllowedUri: url => safeLink(url)}}), TaskList, TaskItem.configure({nested:true})],
  content,
  editorProps: { attributes: { 'aria-label':'작업 문서 편집', spellcheck:'true' } }
});
window.safeTaskLink = safeLink;
