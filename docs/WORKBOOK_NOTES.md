# Supplied workbook inspection

Source: `JUL DEC 2026 - CLUSTERED.xlsx`, copied unchanged to `data/timetable.xlsx`.

## Structure and parsing decisions

- Main worksheet: **`JUL DEC 2026 `** (with a trailing space in Excel).
- Hidden reference worksheets: `Y1S1 Sep -  B1.G2` and `FCIT Y1S1 March 2026`. They use a different day-as-column layout and are not authoritative for the room display.
- Row 2 contains location-category headings; row 3 contains room identifiers and capacities.
- Room columns C–S: A101, A102, A204, A301, A305, A406, A502, A503, A603, A604, A605, A606, A405, A404, A403, A402, A401.
- T/U are City Campus columns. Actual coded sessions in T identify **C302**.
- W/X/Y are named 7th-, 6th-, and 1st-floor meeting rooms.
- A contains weekday sections. B contains written time intervals. Weekdays start at rows 4, 15, 27, 39, 50, 61, and 72.
- Monday lacks a lunch time row. Some weekend merged blocks span a gap between noon and 13:00. Their start/end interval includes that gap, as required by the merged-cell rule.
- Saturday B69 is `17:00–18:00`, followed by B70 `17:00–19:00`. The parser preserves those supplied overlapping row ranges; it does not silently edit them.
- The cells contain both newline separators and literal pipe (`|`) separators. Faculty labels `(FOC)` and `(FOB)` are explicit. Lecturer, intake, capacity, batch/group, and administrative text are removed from the displayed module name.
- A dated replacement embedded after the first session does not become a recurring second session. Date-specific notes need confirmed exceptions.
- Room types come from `ROOM_TYPE_MAPPING`, independently of worksheet category headings: A406 is a lecture hall; A401, A402, A403, and A404 remain explicitly configured computer labs. Unlisted rooms default to lecture halls.

The browser extracts **311 unique sessions**: Monday 28, Tuesday 46, Wednesday 44, Thursday 44, Friday 32, Saturday 57, Sunday 60. It identifies **234 Computing**, **75 Business Management**, and **2 unspecified-faculty** sessions. Forty-three cells are ignored as administrative or insufficient academic information.

## Missing or partial module information

The source literally contains `[NAME NOT FOUND]` for these codes:

| Module code | Anchor cells |
| --- | --- |
| IT1113 | L15, P52 |
| IT1220 | R22, I27 |
| IT1221 | F17, I30, R44, R47 |

Those eight sessions keep their module code and leave the module name cell blank; the display never shows placeholder text such as "Module name unavailable". Populate `MODULE_NAME_OVERRIDES` only with confirmed names.

Four named sessions lack a full module code: Business Mathematics (L32), Strategic Management (G64), Event Management (X64), and Economic Analysis for Managers (L74). Their useful names remain visible and the code is an em dash. The three clearly named business modules use the configurable name-to-faculty mapping.

M76 contains the partial numeric code **081** for Enterprise Resource Planning. It is preserved as written. M76 and X64 do not supply a reliable faculty label, so the display says **Faculty not specified**.

The source labels Monday S4 as `IT1040 - Communication Skills`, while other cells use IT1040 for Fundamentals of Computing. Each cell's supplied name is retained; the code alone is not used to silently replace names.

## Conflicting time notes

The following **16** sessions have standalone written times that disagree with their merged grid range. **Grid times are used by default**, in accordance with the prompt. No correction below is automatically enabled.

All anchors refer to `JUL DEC 2026`.

| Anchor | Day | Grid time used | Written note |
| --- | --- | --- | --- |
| H35 | Wednesday | 16:30–18:30 | 16:00–18:00 |
| W61 | Saturday | 08:00–10:00 | 08:30–10:30 |
| W63 | Saturday | 10:00–12:00 | 10:30–12:30 |
| K64 | Saturday | 11:00–15:00 | 12:00–15:00 |
| N65 | Saturday | 13:00–15:00 | 11:30–13:30 |
| W65 | Saturday | 13:00–16:00 | 13:00–15:30 |
| K67 | Saturday | 15:00–17:00 | 15:30–17:30 |
| W68 | Saturday | 16:00–18:00 | 15:30–17:30 |
| F72 | Sunday | 08:00–10:00 | 08:30–10:30 |
| J73 | Sunday | 09:00–12:00 | 10:30 AM–12:30 AM (invalid same-day range) |
| K74 | Sunday | 10:00–12:00 | 08:30–10:30 |
| M74 | Sunday | 10:00–12:00 | 10:30–12:30 |
| Q75 | Sunday | 11:00–14:00 | 11:30–13:30 |
| K76 | Sunday | 13:00–17:00 | 13:30–16:30 |
| F77 | Sunday | 14:00–17:00 | 13:30–17:00 |
| N77 | Sunday | 14:00–18:00 | 14:00–17:00 |

Confirm the intended times with the campus, then edit the workbook or use `SESSION_OVERRIDES` in `config.js`. For example, `JUL DEC 2026!H35` identifies the first row of the merged Wednesday A406 session.

## Dated notes

Thirty accepted sessions also contain date-related notes. These include past exams, reservations, start dates, and replacements. They are retained in internal `rawText` for maintainers, and appear in console diagnostics only when debug mode is enabled. They are not shown to students and are not interpreted as universal weekly changes.

In particular, Tuesday D15 contains a **22 September replacement** after the regular BM1015 session. The regular BM1015 session retains its Business faculty; the later IT1106 replacement note does not change its faculty or create another recurring class. Confirm that day's full room/time changes and configure `DATE_EXCEPTIONS['2026-09-22']` accordingly.

The configured active period is **1 July–31 December 2026**, based on the supplied workbook title. Actual term dates and special-day closures can be edited in `config.js`.

## Re-run the audit

```sh
node tools/audit-workbook.mjs
```

This writes `test-results/workbook-audit.json` with normalized sessions, source cells, original text, ignored notes, and conflict diagnostics. This development artifact is never used as the production data source and is excluded from deployment.
