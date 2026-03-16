import type { ExtensionMessage } from '@recruitment/shared';

const noteCache = new Map<string, string>();

export function injectNoteIcon(card: Element, candidateId: string, hasNote: boolean): void {
  if (card.querySelector('.rai-note-icon')) return;

  const icon = document.createElement('button');
  icon.className = `rai-note-icon ${hasNote ? 'rai-note-icon--filled' : ''}`;
  icon.textContent = '📝';
  icon.title = 'Add note';
  icon.dataset.candidateId = candidateId;

  icon.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleNoteEditor(card, candidateId);
  });

  const badge = card.querySelector('.rai-badge');
  if (badge) {
    badge.after(icon);
  } else {
    card.appendChild(icon);
  }
}

function toggleNoteEditor(card: Element, candidateId: string): void {
  const existing = card.querySelector('.rai-note-editor');
  if (existing) {
    existing.remove();
    return;
  }

  const editor = document.createElement('div');
  editor.className = 'rai-note-editor';
  editor.innerHTML = `
    <textarea class="rai-note-editor__textarea" placeholder="Add a note..." rows="3">${noteCache.get(candidateId) || ''}</textarea>
    <div class="rai-note-editor__actions">
      <button class="rai-note-editor__save">Save</button>
      <button class="rai-note-editor__cancel">Cancel</button>
    </div>
  `;

  card.appendChild(editor);

  const textarea = editor.querySelector('textarea')!;
  textarea.focus();

  editor.querySelector('.rai-note-editor__save')!.addEventListener('click', async () => {
    const content = textarea.value.trim();
    if (!content) return;

    const response = await chrome.runtime.sendMessage({
      type: 'ADD_NOTE',
      candidateId,
      content,
    } satisfies ExtensionMessage);

    if (response.success) {
      noteCache.set(candidateId, content);
      const icon = card.querySelector('.rai-note-icon');
      if (icon) icon.classList.add('rai-note-icon--filled');
      editor.remove();
    }
  });

  editor.querySelector('.rai-note-editor__cancel')!.addEventListener('click', () => {
    editor.remove();
  });
}
