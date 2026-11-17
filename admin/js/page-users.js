import { mountShell, previewButton } from './shell.js';
import { watch, update, remove, writeProfile, COLLECTIONS } from './store.js';
import { $, el, banner, toast, field, confirmDialog, initials, relativeTime } from './ui.js';
import { firebase, secondaryAuth, toEmail, errorText, FIREBASE_CONFIG, FIREBASE_SDK } from './firebase.js';

const session = await mountShell('users', { requireAdmin: true });
$('#head-actions').append(previewButton());

let users = [];

// --------------------------------------------------------------- add a user
const errorBox = el('div');
const name = field({ label: 'Full name', name: 'name', placeholder: 'Lakshan Perera' });
const username = field({ label: 'Username', name: 'username', placeholder: 'lakshan', help: `Signs in as username@${toEmail('x').split('@')[1]}. A full email address works too.` });
const password = field({ label: 'Password', name: 'password', type: 'password', placeholder: 'At least 6 characters' });
const role = field({ label: 'Role', name: 'role', value: 'editor', options: [['editor', 'Editor'], ['admin', 'Administrator']] });
const addButton = el('button', { class: 'btn btn-primary btn-block', type: 'button', style: 'margin-top:6px', text: 'Add user' });
$('#form').append(errorBox, name.wrap, username.wrap, password.wrap, role.wrap, addButton);

addButton.addEventListener('click', async () => {
  const values = {
    name: name.input.value.trim(),
    username: username.input.value.trim().toLowerCase(),
    password: password.input.value,
    role: role.input.value === 'admin' ? 'admin' : 'editor'
  };
  const problems = [];
  if (!values.name) problems.push('Enter the full name.');
  if (!/^[a-z0-9._@-]{3,}$/i.test(values.username)) problems.push('Usernames use letters, numbers, dots, dashes or underscores — at least 3 characters.');
  if (values.password.length < 6) problems.push('The password needs at least 6 characters.');
  if (users.some(user => user.username === values.username)) problems.push('That username is already taken.');
  if (problems.length) { banner(errorBox, problems); return; }

  addButton.disabled = true;
  try {
    // A secondary Firebase app creates the account without signing the
    // administrator out of their own session.
    const { auth, authSdk } = await secondaryAuth();
    const credential = await authSdk.createUserWithEmailAndPassword(auth, toEmail(values.username), values.password);
    await writeProfile(credential.user.uid, {
      name: values.name,
      username: values.username,
      email: credential.user.email,
      role: values.role,
      active: true,
      createdAt: new Date().toISOString()
    });
    await authSdk.signOut(auth);
    banner(errorBox, '');
    name.input.value = '';
    username.input.value = '';
    password.input.value = '';
    toast(`${values.name} can now sign in.`);
  } catch (error) {
    banner(errorBox, errorText(error));
  } finally { addButton.disabled = false; }
});

// ----------------------------------------------------------------- the list
try {
  await watch(COLLECTIONS.users, data => { users = data; draw(); }, error => banner($('#alerts'), errorText(error)));
} catch (error) {
  banner($('#alerts'), errorText(error));
}

function draw() {
  const list = [...users].sort((a, b) =>
    (a.role === b.role ? 0 : a.role === 'admin' ? -1 : 1) || String(a.name || '').localeCompare(String(b.name || '')));
  $('#count').textContent = `${list.length} configured account(s).`;

  const container = $('#list');
  if (!list.length) {
    container.replaceChildren(el('p', { class: 'card-note', text: 'No accounts yet.' }));
    return;
  }

  container.replaceChildren(...list.map(user => {
    const self = user.id === session.uid;
    const disabled = user.active === false;
    const newPassword = el('input', { type: 'password', placeholder: 'New password', autocomplete: 'new-password' });
    const admins = users.filter(item => item.role === 'admin' && item.active !== false).length;

    return el('div', { class: `list-item${disabled ? ' disabled' : ''}` }, [
      el('div', { class: 'avatar', text: initials(user.name || user.username) }),
      el('div', { class: 'list-main' }, [
        el('div', { class: 'list-title', text: user.name || user.username }),
        el('div', { class: 'list-sub', text: `@${user.username} · ${user.role === 'admin' ? 'Administrator' : 'Editor'}${user.lastSignIn ? ` · last seen ${relativeTime(user.lastSignIn)}` : ''}` }),
        el('div', { class: 'list-tools' }, [
          newPassword,
          el('button', { class: 'btn btn-sm', type: 'button', text: 'Reset', onClick: () => resetPassword(user, self, newPassword) }),
          el('button', {
            class: 'btn btn-sm', type: 'button',
            text: user.role === 'admin' ? 'Make editor' : 'Make admin',
            disabled: self && admins < 2,
            onClick: () => changeRole(user)
          }),
          el('button', {
            class: 'btn btn-sm', type: 'button', text: disabled ? 'Enable' : 'Disable',
            disabled: self,
            onClick: () => setActive(user, disabled)
          }),
          el('button', {
            class: 'btn btn-sm btn-danger', type: 'button', text: 'Delete',
            disabled: self,
            onClick: () => destroy(user)
          })
        ])
      ]),
      el('div', { class: 'list-side', style: 'flex-direction:column;align-items:flex-end;gap:6px' }, [
        el('span', { class: `chip ${disabled ? 'chip-grey' : 'chip-green'}`, text: disabled ? 'Disabled' : 'Active' }),
        self ? el('span', { class: 'card-note', style: 'margin:0', text: 'Currently signed in' }) : null
      ])
    ]);
  }));
}

async function changeRole(user) {
  const next = user.role === 'admin' ? 'editor' : 'admin';
  const ok = await confirmDialog({
    title: `Make ${user.name || user.username} ${next === 'admin' ? 'an administrator' : 'an editor'}?`,
    message: next === 'admin'
      ? 'Administrators can change display settings, campus videos and other accounts.'
      : 'Editors keep access to the weekly timetable and the exam timetable only.',
    confirmLabel: 'Change role', danger: false
  });
  if (!ok) return;
  try { await update(COLLECTIONS.users, user.id, { role: next }); toast('Role updated.'); }
  catch (error) { toast(errorText(error), 'err'); }
}

async function setActive(user, enabling) {
  if (!enabling) {
    const ok = await confirmDialog({
      title: `Disable ${user.name || user.username}?`,
      message: 'They stay in the list but cannot sign in until you enable them again.',
      confirmLabel: 'Disable'
    });
    if (!ok) return;
  }
  try { await update(COLLECTIONS.users, user.id, { active: enabling }); toast(enabling ? 'Account enabled.' : 'Account disabled.'); }
  catch (error) { toast(errorText(error), 'err'); }
}

async function destroy(user) {
  const ok = await confirmDialog({
    title: `Delete ${user.name || user.username}?`,
    message: 'The account record is removed and they lose access immediately. The Firebase Authentication login itself is only removed if the optional admin Cloud Function is deployed — otherwise delete it in the Firebase console as well.'
  });
  if (!ok) return;
  try {
    await callAdminFunction('adminDeleteUser', { uid: user.id }).catch(() => null);
    await remove(COLLECTIONS.users, user.id);
    toast('Account deleted.');
  } catch (error) { toast(errorText(error), 'err'); }
}

async function resetPassword(user, self, input) {
  const next = input.value;
  if (next.length < 6) { toast('Type a new password of at least 6 characters first.', 'err'); return; }

  if (self) {
    try {
      const { auth, authSdk } = await firebase();
      await authSdk.updatePassword(auth.currentUser, next);
      input.value = '';
      toast('Your password has been changed.');
    } catch (error) {
      toast(error.code === 'auth/requires-recent-login'
        ? 'Sign out and back in, then change your password again.'
        : errorText(error), 'err', 6000);
    }
    return;
  }

  try {
    await callAdminFunction('adminSetPassword', { uid: user.id, password: next });
    input.value = '';
    toast(`Password changed for ${user.name || user.username}.`);
  } catch (error) {
    // No Cloud Function deployed: fall back to Firebase's own reset email,
    // which only works for accounts created with a real email address.
    if (user.email && !user.email.endsWith(toEmail('x').split('@')[1])) {
      try {
        const { auth, authSdk } = await firebase();
        await authSdk.sendPasswordResetEmail(auth, user.email);
        toast(`Password reset email sent to ${user.email}.`);
        return;
      } catch { /* fall through to the explanation below */ }
    }
    toast('Changing another user\'s password needs the optional admin Cloud Function (see functions/README.md), or reset it in the Firebase console.', 'err', 8000);
  }
}

/** Calls an optional callable Cloud Function; rejects when none is deployed. */
async function callAdminFunction(name, payload) {
  const { app } = await firebase();
  const sdk = await import(`${FIREBASE_SDK}/firebase-functions.js`);
  const functions = sdk.getFunctions(app, FIREBASE_CONFIG.functionsRegion || 'us-central1');
  const callable = sdk.httpsCallable(functions, name);
  const result = await callable(payload);
  return result.data;
}

