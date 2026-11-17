import { mountShell, previewButton } from './shell.js';
import { watch, create, update, remove, writeBatch, COLLECTIONS } from './store.js';
import { $, el, icon, banner, toast, field, checkbox, confirmDialog, modal } from './ui.js';
import { errorText } from './firebase.js';
import { directVideoUrl } from '../../js/schema.js';

await mountShell('media', { requireAdmin: true });
$('#head-actions').append(previewButton());

let videos = [];

// ------------------------------------------------------------------ add form
const errorBox = el('div');
const title = field({ label: 'Video title', name: 'title', placeholder: 'e.g. Main Intake 2027' });
const url = field({ label: 'Share link or file path', name: 'url', placeholder: 'https://www.dropbox.com/scl/fi/…/video.mp4?rlkey=…&dl=0' });
const order = field({ label: 'Playlist order', name: 'order', type: 'number', value: '0', attrs: { min: '0' }, help: 'Lower numbers play first. Leave at 0 to add to the end.' });
const enabled = checkbox({ label: 'Play this clip on the display', name: 'enabled', checked: true });
const addButton = el('button', { class: 'btn btn-primary btn-block', type: 'button', style: 'margin-top:6px', text: 'Add video' });

$('#form').append(errorBox, title.wrap, url.wrap, el('div', { class: 'field-row' }, [order.wrap]), enabled.wrap, addButton);

addButton.addEventListener('click', async () => {
  const values = {
    title: title.input.value.trim(),
    url: url.input.value.trim(),
    order: Number(order.input.value) || 0,
    enabled: enabled.input.checked
  };
  const problems = [];
  if (!values.title) problems.push('Give the clip a title so the playlist stays readable.');
  if (!values.url) problems.push('Paste the share link or the file path.');
  if (problems.length) { banner(errorBox, problems); return; }

  values.playbackUrl = directVideoUrl(values.url);
  if (!values.order) values.order = (videos.reduce((max, video) => Math.max(max, Number(video.order) || 0), 0) || 0) + 1;

  addButton.disabled = true;
  try {
    await create(COLLECTIONS.videos, values);
    banner(errorBox, '');
    title.input.value = '';
    url.input.value = '';
    order.input.value = '0';
    toast('Video added to the playlist.');
  } catch (error) { banner(errorBox, errorText(error)); }
  finally { addButton.disabled = false; }
});

// -------------------------------------------------------------------- library
try {
  await watch(COLLECTIONS.videos, data => { videos = data; draw(); }, error => banner($('#alerts'), errorText(error)));
} catch (error) {
  banner($('#alerts'), errorText(error));
}

function sorted() {
  return [...videos].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.title).localeCompare(String(b.title)));
}

async function reorder(index, direction) {
  const list = sorted();
  const target = index + direction;
  if (target < 0 || target >= list.length) return;
  const [item] = list.splice(index, 1);
  list.splice(target, 0, item);
  try {
    await writeBatch(list.map((video, position) => ({ collection: COLLECTIONS.videos, id: video.id, data: { order: position + 1 } })));
  } catch (error) { toast(errorText(error), 'err'); }
}

function draw() {
  const list = sorted();
  const live = list.filter(video => video.enabled !== false && video.url).length;
  $('#count').innerHTML = `<strong>${list.length}</strong> clips in the library · ${live} playing on the display`;

  const container = $('#library');
  if (!list.length) {
    container.replaceChildren(el('p', { class: 'card-note', text: 'The playlist is empty. Add a clip on the left and it appears here straight away.' }));
    return;
  }
  container.replaceChildren(...list.map((video, index) => {
    const off = video.enabled === false;
    const direct = video.playbackUrl || directVideoUrl(video.url);
    return el('div', { class: `list-item${off ? ' disabled' : ''}` }, [
      el('div', { class: 'avatar', text: String(index + 1) }),
      el('div', { class: 'list-main' }, [
        el('div', { class: 'list-title', text: video.title || 'Untitled clip' }),
        el('div', { class: 'list-sub', text: video.url || '' }),
        el('div', { class: 'list-tools' }, [
          el('button', { class: 'btn btn-sm', type: 'button', text: off ? 'Turn on' : 'Turn off', onClick: () => toggle(video, off) }),
          el('button', { class: 'btn btn-sm', type: 'button', text: 'Test', onClick: () => preview(video, direct) }),
          el('button', { class: 'btn btn-sm', type: 'button', text: 'Rename', onClick: () => rename(video) }),
          el('button', { class: 'btn btn-sm', type: 'button', 'aria-label': 'Move up', html: icon('up'), disabled: index === 0, onClick: () => reorder(index, -1) }),
          el('button', { class: 'btn btn-sm', type: 'button', 'aria-label': 'Move down', html: icon('down'), disabled: index === list.length - 1, onClick: () => reorder(index, 1) }),
          el('button', { class: 'btn btn-sm btn-danger', type: 'button', text: 'Delete', onClick: () => destroy(video) })
        ])
      ]),
      el('div', { class: 'list-side' }, [el('span', { class: `chip ${off ? 'chip-grey' : 'chip-green'}`, text: off ? 'Off' : 'On' })])
    ]);
  }));
}

async function toggle(video, off) {
  try { await update(COLLECTIONS.videos, video.id, { enabled: off }); }
  catch (error) { toast(errorText(error), 'err'); }
}

async function destroy(video) {
  const ok = await confirmDialog({
    title: 'Remove this clip?',
    message: `"${video.title || 'Untitled clip'}" is removed from the playlist. The file itself is untouched.`,
    confirmLabel: 'Remove'
  });
  if (!ok) return;
  try { await remove(COLLECTIONS.videos, video.id); toast('Clip removed.'); }
  catch (error) { toast(errorText(error), 'err'); }
}

function rename(video) {
  let box;
  modal({
    title: 'Edit clip',
    confirmLabel: 'Save',
    width: '520px',
    build: body => {
      box = el('div');
      const name = field({ label: 'Video title', name: 'title', value: video.title || '' });
      const link = field({ label: 'Share link or file path', name: 'url', value: video.url || '' });
      body.append(box, name.wrap, link.wrap);
    },
    onConfirm: async body => {
      const nextTitle = body.querySelector('[name=title]').value.trim();
      const nextUrl = body.querySelector('[name=url]').value.trim();
      if (!nextTitle || !nextUrl) { banner(box, 'Both the title and the link are needed.'); return false; }
      try { await update(COLLECTIONS.videos, video.id, { title: nextTitle, url: nextUrl, playbackUrl: directVideoUrl(nextUrl) }); toast('Clip updated.'); }
      catch (error) { banner(box, errorText(error)); return false; }
    }
  });
}

function preview(video, direct) {
  modal({
    title: video.title || 'Clip test',
    note: 'If it does not play here, it will not play on the board either.',
    confirmLabel: 'Close',
    width: '720px',
    build: body => {
      const player = el('video', { controls: true, style: 'width:100%;border-radius:12px;background:#000', src: direct.startsWith('http') ? direct : `../${direct.replace(/^\.?\//, '')}` });
      const status = el('p', { class: 'card-note', text: 'Loading…' });
      player.addEventListener('loadeddata', () => { status.textContent = 'Plays fine.'; });
      player.addEventListener('error', () => { status.textContent = 'The browser could not load this file. Check the link is public and the file is H.264 MP4.'; });
      body.append(player, status, el('p', { class: 'card-note', style: 'word-break:break-all', text: `Direct URL: ${direct}` }));
    },
    onConfirm: () => true
  });
}
