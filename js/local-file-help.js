// Classic scripts can run from file:// even when browser security blocks ES
// modules and Excel fetches. Explain how to start the local preview in that case.
(() => {
  if (window.location.protocol !== 'file:') return;
  const setText = (id, text) => { document.getElementById(id).textContent = text; };
  setText('empty-eyebrow', 'OPEN YOUR LOCAL PREVIEW');
  setText('empty-title', 'Start the timetable with the launcher');
  setText('empty-message', 'Double-click Start Timetable.cmd in the project folder. It will open the working timetable in your browser.');
  setText('board-note', 'The timetable needs to be opened through its local preview.');
  document.getElementById('loading-track').hidden = true;
  const clock = () => {
    const date = new Date();
    const hour = date.getHours();
    setText('clock-time', `${String(hour % 12 || 12).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`);
    setText('clock-seconds', String(date.getSeconds()).padStart(2, '0'));
    setText('clock-ampm', hour >= 12 ? 'PM' : 'AM');
    setText('clock-day', date.toLocaleDateString('en-GB', { weekday: 'long' }).toUpperCase());
    setText('clock-date', date.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase());
  };
  clock();
  setInterval(clock, 1000);
})();
