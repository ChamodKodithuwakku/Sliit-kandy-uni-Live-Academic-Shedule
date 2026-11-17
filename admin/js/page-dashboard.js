import { mountShell, previewButton } from './shell.js';
import { listAll, readSettings, readArrangement, COLLECTIONS } from './store.js';
import { $, el, icon, banner, relativeTime } from './ui.js';
import { errorText } from './firebase.js';
import {
  WEEK_DAYS, dateKey, formatRange, formatDateLong, timeToMinutes, compareEntries
} from '../../js/schema.js';

const session = await mountShell('dashboard');
$('#head-actions').append(previewButton());

const now = new Date();
const today = WEEK_DAYS[(now.getDay() + 6) % 7];
$('#greeting').innerHTML = `Signed in as <strong>${session.profile.name || session.profile.username}</strong> · ${now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}`;

try {
  const [entries, exams, videos, users, settings, arrangement] = await Promise.all([
    listAll(COLLECTIONS.timetable),
    listAll(COLLECTIONS.exams),
    listAll(COLLECTIONS.videos),
    session.isAdmin ? listAll(COLLECTIONS.users) : Promise.resolve([]),
    readSettings(),
    readArrangement()
  ]);
  render({ entries, exams, videos, users, settings, arrangement });
} catch (error) {
  banner($('#alerts'), errorText(error));
}

function stat({ label, value, hint, tone = '', iconName = 'calendar' }) {
  return el('div', { class: 'card' }, [
    el('div', { class: `stat ${tone}` }, [
      el('div', { class: 'pip', html: icon(iconName) }),
      el('span', { class: 'label', text: label }),
      el('span', { class: 'value', text: String(value) }),
      el('span', { class: 'hint', text: hint })
    ])
  ]);
}

function render({ entries, exams, videos, users, settings, arrangement }) {
  const visible = entries.filter(entry => entry.visible !== false);
  const todayEntries = visible.filter(entry => entry.day === today).sort(compareEntries);
  const todayKey = dateKey(now);
  const upcomingExams = exams
    .filter(exam => exam.visible !== false && String(exam.date || '') >= todayKey)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const liveVideos = videos.filter(video => video.enabled !== false && video.url);

  $('#stats').replaceChildren(
    stat({ label: 'Timetable entries', value: entries.length, hint: `${visible.length} visible on the display`, iconName: 'calendar' }),
    stat({ label: "Today's sessions", value: todayEntries.length, hint: today, tone: 'green', iconName: 'clock' }),
    stat({ label: 'Upcoming exams', value: upcomingExams.length, hint: upcomingExams[0] ? `Next: ${formatDateLong(upcomingExams[0].date)}` : 'None scheduled', tone: 'amber', iconName: 'exam' }),
    session.isAdmin
      ? stat({ label: 'Campus videos', value: liveVideos.length, hint: `${videos.length} in the library · ${users.length} user account(s)`, iconName: 'media' })
      : stat({ label: 'Campus videos', value: liveVideos.length, hint: `${videos.length} in the library`, iconName: 'media' })
  );

  // ----- what the display is doing right now
  const showing = $('#now-showing');
  const rows = [];
  if (settings.videoOnlyMode) {
    rows.push(el('div', { class: 'alert alert-warn', html: `${icon('alert')}<div><strong>Exam mode is on.</strong> The timetable is paused and only campus videos play, back to back.</div>` }));
  }
  if (settings.dataSource === 'excel') {
    rows.push(el('div', { class: 'alert alert-info', html: `${icon('alert')}<div>The display is reading <code>data/timetable.xlsx</code>, not the Timetable page. Change this under Display Settings.</div>` }));
  }
  const activeFrom = settings.activeFrom, activeTo = settings.activeTo;
  if ((activeFrom && todayKey < activeFrom) || (activeTo && todayKey > activeTo)) {
    rows.push(el('div', { class: 'alert alert-warn', html: `${icon('alert')}<div>Today falls outside the active term (${activeFrom || '—'} → ${activeTo || '—'}), so the board shows the between-terms message.</div>` }));
  }
  const list = el('div', { class: 'list' });
  for (const segment of arrangement.sequence) {
    const seconds = segment.type === 'videos'
      ? (liveVideos.length ? `${liveVideos.length} clip(s), played in full` : 'No videos enabled')
      : `${segment.duration || settings.timetableDuration}s on screen`;
    list.append(el('div', { class: `list-item${segment.enabled === false ? ' disabled' : ''}` }, [
      el('div', { class: 'avatar', html: icon(segment.type === 'videos' ? 'media' : segment.type === 'exams' ? 'exam' : 'calendar') }),
      el('div', { class: 'list-main' }, [
        el('div', { class: 'list-title', text: segment.label }),
        el('div', { class: 'list-sub', text: seconds })
      ]),
      el('div', { class: 'list-side' }, [
        el('span', { class: `chip ${segment.enabled === false ? 'chip-grey' : 'chip-green'}`, text: segment.enabled === false ? 'Off' : 'On' })
      ])
    ]));
  }
  rows.push(list);
  showing.replaceChildren(...rows);

  // ----- today
  $('#today-title').textContent = `${today}'s sessions`;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const body = $('#today-rows');
  if (!todayEntries.length) {
    body.replaceChildren(el('tr', { class: 'empty-row' }, [el('td', { colspan: '4', text: 'No sessions are scheduled for today.' })]));
  } else {
    body.replaceChildren(...todayEntries.map(entry => {
      const start = timeToMinutes(entry.startTime);
      const end = timeToMinutes(entry.endTime);
      const status = minutes >= start && minutes < end ? ['Ongoing', 'chip-green']
        : minutes < start ? ['Upcoming', 'chip-amber'] : ['Finished', 'chip-grey'];
      return el('tr', {}, [
        el('td', { class: 'nowrap', text: formatRange(entry.startTime, entry.endTime) }),
        el('td', {}, [
          el('span', { class: 'primary', text: entry.moduleName || entry.moduleCode || '—' }),
          el('span', { class: 'sub', text: [entry.moduleCode, entry.intake].filter(Boolean).join(' · ') })
        ]),
        el('td', { text: entry.room || '—' }),
        el('td', {}, [el('span', { class: `chip ${status[1]}`, text: status[0] })])
      ]);
    }));
  }

  // ----- recent edits
  const recent = [
    ...entries.map(entry => ({ ...entry, where: 'Timetable', what: entry.moduleName || entry.moduleCode, when: `${entry.day} ${formatRange(entry.startTime, entry.endTime)}` })),
    ...exams.map(exam => ({ ...exam, where: 'Exam timetable', what: exam.moduleName || exam.moduleCode, when: `${formatDateLong(exam.date)} ${formatRange(exam.startTime, exam.endTime)}` }))
  ].filter(item => item.updatedAt)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 10);

  const recentBody = $('#recent-rows');
  if (!recent.length) {
    recentBody.replaceChildren(el('tr', { class: 'empty-row' }, [el('td', { colspan: '4', text: 'Nothing has been edited yet.' })]));
  } else {
    recentBody.replaceChildren(...recent.map(item => el('tr', {}, [
      el('td', { class: 'nowrap', text: relativeTime(item.updatedAt) }),
      el('td', {}, [
        el('span', { class: 'primary', text: item.what || '—' }),
        el('span', { class: 'sub', text: `${item.when} · ${item.room || '—'}` })
      ]),
      el('td', { text: item.where }),
      el('td', { text: item.updatedBy || '—' })
    ])));
  }
}
