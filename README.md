# SLIIT Kandy UNI · Live academic display

A fullscreen campus timetable for a 55-inch landscape Android display. The supplied Excel workbook drives the classes; the device's local date and time drive **ONGOING** and **UPCOMING** status. The screen alternates between the timetable and the two supplied campus videos.

**HTML, CSS, vanilla JavaScript, locally bundled SheetJS, and HTML5 video.** No backend, database, login, API, or production build is needed. Node is used only for the optional automated development tests.

## Run locally

**On Windows, double-click `Start Timetable.cmd`.** It starts the static preview in the background and opens the working timetable in your browser. Python must be installed. You can use the launcher again whenever you need to reopen the display; it reuses an existing preview when available.

Opening `index.html` directly will show launcher instructions because the browser blocks the required module scripts and Excel requests on a `file://` URL.

Alternatively, open a terminal in this folder and run:

```sh
python -m http.server 8080
```

Open **http://localhost:8080**. VS Code's Live Server also works. Use an HTTP server: double-clicking `index.html` creates a `file://` URL, which browsers cannot use to fetch the workbook and JavaScript modules reliably.

Production mode uses the actual device clock. If today's sessions have finished, the display correctly shows the end-of-day screen. To preview real workbook data during class hours, temporarily enable the development settings below.

## Files

```text
index.html                   Fullscreen display
style.css                    Responsive signage layout
app.js                       Clock, rendering, paging, and lifecycle
config.js                    All configurable settings
js/parser.js                 Browser-side Excel and merged-cell parser
js/schedule.js               Time, date exceptions, and paging
js/rooms.js                  Explicit room type mapping
js/video.js                  Timetable/video state machine
data/timetable.xlsx          Copy of your supplied workbook
videos/1.mp4, 2.mp4          Optimized deployment videos
assets/fonts/                Bundled Inter font and license
assets/favicon.svg           Generic academic icon
vendor/                      SheetJS 0.20.3 and its license
docs/WORKBOOK_NOTES.md        Source ambiguities and parser decisions
tests/                       Optional automated checks
vercel.json                  Static deployment configuration
```

The original workbook and replacement 4K MP4 files remain at the project root and are excluded from Git and Vercel. Edit and publish the copies in `data/` and `videos/`. The two replacement videos are converted to 1920×1080 H.264/AAC with fast-start metadata, preserving their full durations. Video 1 (`1.mp4`) is 12.655 seconds and Video 2 (`2.mp4`) is 34.833 seconds. The largest deployment copy is approximately 16 MiB.

## How the display works

- The clock updates every second. `updateSessionProgress()` recalculates sessions and their progress every five seconds. A separate deadline also updates the board at the next session start, session end, or midnight.
- Start time is inclusive; end time is exclusive. A class remains ongoing until its own end time, including overlapping and long classes.
- Only the current local weekday is evaluated. The supplied July–December 2026 timetable has a configurable term range.
- The browser reads the workbook once after a successful load. Failed loads retry automatically every minute.
- Visible worksheets with room headers, day sections, and time rows are detected. Hidden reference sheets are excluded.
- Each merged block becomes one session, from the first covered time row to the last covered row's end. Empty and administrative cells are ignored.
- Explicit `FOC` / `FOB` labels take precedence over configurable module-prefix mappings. No classification relies on cell color.
- The table shows module code, module name, location, **start time**, **end time**, status, and faculty. Start/end times come from the parsed Excel session and use a 12-hour format with AM/PM.
- Ongoing sessions show a green progress bar and a completion percentage, calculated from `(current time − start time) / (end time − start time)`. The values are clamped to 0–100% and updated in place; upcoming sessions have no elapsed-time bar. Progress is calculated at runtime and is never written to the workbook.
- Locations use **COMPUTER LAB** only when explicitly configured in `ROOM_TYPE_MAPPING`. A401, A402, A403, and A404 are configured as computer labs; A406 is a **LECTURE HALL**. Unlisted rooms default to lecture halls. Lecturer names and workbook notes stay off the display.
- Ongoing sessions appear first. When they fit, they remain on every page while upcoming sessions rotate. When they exceed a page, ongoing pages receive more screen time. Pages resume after a video, so every page remains reachable.
- Every two minutes of timetable display, the next video plays fullscreen to its natural end. The timetable timer then starts again. The cycle is `timetable (2 min) → Video 1 → timetable (2 min) → Video 2 → repeat`.
- Video playback defaults to muted, has no transport controls, and uses `object-fit: cover`. Its rounded frame has a floating “Playing Video 1 / 2” badge that follows the active clip. Failed or stalled videos are skipped; if every video fails, the timetable returns and the next cycle retries.
- The white dashboard uses blue computing badges, red business badges and icons, green ONGOING and yellow UPCOMING status colours, and a card table with seven unchanged columns. Previous/next buttons supplement automatic pagination; clicking either starts a fresh page interval. Layout spacing adapts to the display size, and reduced-motion preferences disable decorative animation.

## Replace the Excel timetable

1. Replace **`data/timetable.xlsx`**, keeping that filename. Alternatively, update `EXCEL_FILE` in `config.js`.
2. Keep the room-column/day-section/time-row layout. Header positions and merge ranges are detected from the workbook.
3. Review `ACTIVE_DATE_RANGE` when changing semesters. Set both boundaries to `null` for an unrestricted recurring weekly schedule.
4. Commit/push the changed file to GitHub and let Vercel redeploy.
5. Reload or reopen the display URL once to load the replacement workbook. During normal operation the browser retains the successfully loaded timetable in memory.

Editing the original Excel file on your computer does **not** update the deployed site automatically. A replacement deployment and a fresh page load are required. There is no background polling of the workbook.

**Read [the workbook notes](docs/WORKBOOK_NOTES.md) before campus rollout.** The supplied source contains missing module names, dated replacement notes, and 16 conflicting written time notes. The display uses the merged grid times unless you configure a confirmed override.

## Videos

Add browser-compatible MP4s inside `videos/` and list their filenames in `config.js`:

```js
VIDEO_FOLDER: './videos/',
VIDEOS: ['01-open-day.mp4', '02-campus-life.mp4', '10-programmes.mp4'],
VIDEO_MUTED: true,
TIMETABLE_DURATION: 120000,
```

Files are naturally sorted by filename (`2` before `10`). Rename files to change the sequence. Static hosting cannot enumerate an arbitrary directory, so the `VIDEOS` list must be updated when adding or removing files. An empty array disables video breaks.

Use `VIDEO_MUTED: false` only with a browser/device configured to allow audio autoplay. If audio autoplay is denied, the player retries muted. See the [Chrome autoplay policy](https://developer.chrome.com/blog/autoplay).

For large replacement videos, an optional FFmpeg command is:

```sh
ffmpeg -i original.mp4 -vf scale=1920:1080 -c:v libx264 -preset fast -crf 21 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart videos/04-campus.mp4
```

The example assumes a 16:9 input. Keep originals outside the deployed video folder.

## Computer lab rooms and faculty mapping

Change these values in `config.js`:

```js
ROOM_TYPE_MAPPING: {
  A401: 'COMPUTER LAB',
  A402: 'COMPUTER LAB',
  A403: 'COMPUTER LAB',
  A404: 'COMPUTER LAB',
  A406: 'LECTURE HALL'
},
FACULTY_MAPPING: {
  IT: 'Faculty of Computing',
  IE: 'Faculty of Computing',
  SE: 'Faculty of Computing',
  FCIT: 'Faculty of Computing',
  BM: 'Faculty of Business Management',
  IM: 'Faculty of Business Management'
},
```

Only an explicit `COMPUTER LAB` mapping makes a room a computer lab. Change any room's entry to `LECTURE HALL` to override it, or remove it to use that default. Use uppercase room identifiers as keys. **A406 and A405 are lecture halls**. A401, A402, A403, and A404 remain computer labs as confirmed for this update. The same mapping applies to parsed workbook sessions, room overrides, and sessions added through date exceptions. Meeting-room headers and the explicit City Campus C302 location are also supported.

Use `FACULTY_LABELS` for explicit faculty abbreviations and `MODULE_FACULTY_MAPPING` for known module names that have no code. Unknown faculty is clearly labeled; it is never guessed from color.

## Display layout

The display uses a compact university header, a small schedule heading with a plain live indicator, flat rows with horizontal separators, and a narrow pagination strip. The large title section and decorative footer have been removed. The expanded table can show up to **10 rows at 1920×1080**; smaller screens automatically use fewer rows, and pages with fewer sessions get taller rows.

Desktop column widths total 100%: module code 8%, module name 32%, location 11%, start time 9%, end time 9%, status 10%, faculty 21%. These proportions give module names and faculty labels more space without horizontal scrolling. `MAX_ROWS` in `config.js` controls the upper row limit.

## Confirmed corrections and special dates

`SESSION_OVERRIDES` uses the trimmed worksheet name and the merged cell's top-left address:

```js
SESSION_OVERRIDES: {
  'JUL DEC 2026!H35': { startTime: '16:00', endTime: '18:00' }
},
```

That example is **not enabled** by default; use it only after confirming the correct time with the campus. Overrides can also set `moduleName`, `faculty`, `room`, or `exclude: true`. `MODULE_NAME_OVERRIDES` can set a confirmed name for every occurrence of a module code.

For one-off dates, use local `YYYY-MM-DD` keys:

```js
DATE_EXCEPTIONS: {
  '2026-09-22': { closed: true },
  '2026-09-23': {
    useDay: 'Monday',
    exclude: ['JUL DEC 2026!D4'],
    add: [{
      moduleCode: 'IT1120',
      moduleName: 'Introduction to Programming',
      room: 'A401',
      faculty: 'Faculty of Computing',
      startTime: '09:00',
      endTime: '11:00'
    }]
  }
},
```

These examples demonstrate the configuration shape; they are not active timetable changes. Date exceptions do not affect later weeks.

## Logo

The supplied logo lives at `assets/logo.png` and is referenced by `LOGO_PATH` in `config.js`. The header shows this image (top left, 60–90 px tall at the target display resolution, aspect ratio preserved) above the "LIVE ACADEMIC SCHEDULE" tagline. The original navy wordmark and orange crest appear directly on the white header without color filters. If the image cannot be loaded, the logo area is hidden and the timetable still runs.

The branding area repeats a 12-second CSS sequence: the logo appears at 0–3 seconds, fades and scales out at 3–4 seconds, “Heritage | Knowledge | Impact” appears at 4–8 seconds, the message fades out at 8–9 seconds, and the logo returns at 9–12 seconds. The message uses spaced navy serif typography, a gentle upward reveal, and expanding letter spacing. The logo fades in on initial load, remains front-facing, and stays visible across the loop boundary. Both states share a fixed area that preserves the logo dimensions, header height, and tagline position. Reduced-motion preferences show the static logo.

## Deploy to Vercel

1. Create a GitHub repository and upload this project's files, including `data/`, `videos/`, `vendor/`, and `assets/`. When uploading manually, omit `node_modules/`, `.npm-cache/`, `test-results/`, and the originals at the root.
2. In Vercel, import the GitHub repository.
3. Choose **Other** as the framework. Use the repository root as the project root.
4. The included `vercel.json` disables the install/build steps and serves the root as static output. No environment variables or backend configuration are required.
5. Deploy, then open the Vercel HTTPS URL on the display.

The project is prepared for deployment; this workspace task does not create a GitHub repository or publish a Vercel site.

## Open a Chrome website link directly in fullscreen

The page requests fullscreen as soon as it loads. Desktop Chrome needs a per-site automatic-fullscreen permission to allow this without a click. On Windows, run the following once from the project folder for the Live Server address:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\enable-automatic-fullscreen.ps1 -Url http://127.0.0.1:5501
```

Open `chrome://policy`, click **Reload policies**, then reopen the timetable URL. Restarting Chrome also applies the setting. The script adds Chrome's `AutomaticFullscreenAllowedForUrls` policy for this Windows user and this exact origin (including its port); Chrome may show a managed-browser indicator. For a deployed website, substitute its HTTPS URL and configure each display computer separately. Existing policy entries are preserved; an administrator's blocking policy takes precedence. See [Chrome's policy definition](https://chromium.googlesource.com/chromium/src/+/HEAD/components/policy/resources/templates/policy_definitions/ContentSettings/AutomaticFullscreenAllowedForUrls.yaml).

To undo the permission, run the same command with `-Remove`. Without this permission the browser rejects the automatic request, so the page shows a small **Click anywhere to enter fullscreen** message; the next click or tap anywhere enters fullscreen and removes the message. The page retries after a rejected request and respects exiting fullscreen (the message does not return). The **+** button remains available as a manual fallback. The message is never shown where the Fullscreen API is unavailable, such as inside an embedding app that blocks it.

To verify fullscreen behavior against a running local server:

```powershell
$env:TEST_URL = 'http://127.0.0.1:5501'
node tests/fullscreen.mjs
node tests/fullscreen.mjs --policy
```

The first check uses temporary test-browser permissions; `--policy` checks that the actual installed Chrome policy allows fullscreen on page load without a click.

## Android display setup

1. Use a current Android Chrome browser or your display's compatible kiosk browser.
2. Set landscape orientation and a 1920×1080 display resolution where supported.
3. Enable automatic date/time and set the device timezone to **Asia/Colombo** for SLIIT Kandy. The app deliberately uses the device's local timezone.
4. Open the deployed HTTPS URL. Muted playback starts without interaction.
5. Use the browser's kiosk/fullscreen mode to hide browser chrome. The app also attempts the Fullscreen API; if the browser requires a gesture, tap once anywhere or press **F**. No visible button is required.
6. Disable device sleep and screensavers in the display settings. The app requests a screen wake lock when the browser supports it.
7. Configure the kiosk browser to reopen this URL on startup if the hardware supports it.

The app fills the viewport even when fullscreen or wake lock is unavailable. Browser chrome, boot behavior, and operating-system sleep settings must be configured on the actual device. Physical 55-inch Android hardware has not been tested in this workspace.

## Development testing

In `config.js`, temporarily set:

```js
DEBUG_MODE: true,
TEST_MODE: true,
TEST_DAY: 'Tuesday',
TEST_TIME: '09:00',
TEST_DATE: '2026-09-15',
TIMETABLE_DURATION: 10000,
```

This uses the **actual supplied workbook**, with a fixed simulated day/time. The test date anchors the week and date exceptions. Debug output goes only to the console. Before deployment, restore `DEBUG_MODE: false`, `TEST_MODE: false`, and `TIMETABLE_DURATION: 120000`.

Optional automated checks require Node 22.15+ and installed Google Chrome:

```sh
npm install
npm test
# Start the local static server in a separate terminal first:
npm run test:browser
node tools/audit-workbook.mjs
```

On restricted environments that block child-process isolation, run `node --test --test-isolation=none tests/timetable.test.js tests/video.test.js`. Use `BROWSER_CHANNEL=msedge` in your shell environment to test with installed Edge instead of Chrome. `TEST_URL` changes the browser test's URL.

The logic tests cover all 311 actual session boundaries, the nine requested sample times on all weekdays, merged sessions, faculty and room rules, date changes, pagination, two-minute timing, stalled/missing media, and video order. Browser checks exercise actual Excel fetches, local assets, responsive layouts, live updates, error recovery, and both real MP4s. Video tests accelerate playback only in the test browser; production playback speed remains normal.

Test screenshots and the full JSON workbook audit are written to `test-results/` and are excluded from deployment.

## Third-party assets

- [SheetJS Community Edition 0.20.3](https://docs.sheetjs.com/docs/getting-started/installation/standalone/), vendored locally. Apache 2.0 license: `vendor/SHEETJS-LICENSE.txt`.
- [Inter](https://github.com/rsms/inter), bundled variable font. SIL Open Font License: `assets/fonts/OFL.txt`.
- Workbook and promotional videos supplied by the project owner.
