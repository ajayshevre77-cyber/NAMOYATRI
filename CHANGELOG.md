# Changelog

All notable changes to the Namo Yatri frontend.

---

## 2026-10-07

### Security — closed the two open items from the hardening brief

**CORS origin check could be bypassed.** The allow-list used substring matching,
so `localhost.attacker.com` and `evil.com/?x=127.0.0.1` were both accepted and
granted credentialed cross-origin access. The check now parses the URL and
matches the hostname exactly. Covered by 13 cases, including the six strings
that defeated the old check.

**The browser could grant itself ADMIN.** `src/lib/firebase.ts` assigned the
ADMIN role on an email-string match with no email-verification check, so the
interface would render admin screens on client data alone. The server was never
fooled — it requires a verified email — but this is exactly what the brief asked
to remove. The client now reads its role from `GET /api/users/me`, the server's
own answer. The hardcoded admin address no longer ships in the browser bundle.

All 10 security scenarios still pass.

### Changed — Ride booking screen navigation

The bottom bar went from three items to five. **Account** was removed and
replaced by **Explore**, **Tour** and **Map**:

> Home · Explore · **Pass** · Tour · Map

Pass stays third of five, so it remains dead centre, raised and highlighted as
the original sketch specified.

Labels and icons now come from the same translation file the main app uses, so
a destination is never called two different things in two places. "Tour" is
therefore **Travel** — the term already translated as `यात्रा` and `प्रवास`;
"Tour" would have needed new Hindi and Marathi strings invented.

Checked at 448 / 390 / 320px in all three languages: no overflow, nothing
truncated, every target above the 48px minimum.

---

## 2026-10-02

The headline: **the ride booking screen from your sketch is built and working.**
Alongside it, the project now compiles cleanly for the first time — it never did
before, for a reason explained under *Infrastructure*.

### Added — Ride booking screen

Built to the three-section layout in the sketch: advertisement panel on top,
ride booking form in the middle, fixed three-item navigation bar at the bottom
with the centre **Pass** item raised and highlighted.

Reachable at `http://localhost:3000/?screen=ride`.

Seven reusable components, each in `src/components/`:

| Component | What it does |
| --- | --- |
| `AdPanel` | Advertisement slot. Holds its height when empty, so nothing shifts when a real ad loads |
| `LocationInput` | One labelled location field, with focus, error and disabled states |
| `RideOptions` | Transport choices with live regulated fares, as a proper radio group |
| `BookRideButton` | Primary call to action, full width, with a busy state |
| `RideBookingCard` | The form itself — route, timing, passengers, ride type, validation |
| `BottomNavigation` | The fixed three-item bar |
| `NavItem` | One destination in that bar |

Composed by `src/views/RideBookingScreen.tsx`.

Behaviour confirmed in a browser:

- Validation blocks submission and marks the offending field in red
- Swapping pickup and destination works
- "Leave now" versus a scheduled date and time; a past time is rejected
- Passenger count, 1 to 6
- Fares recalculate as the route and ride type change
- Content scrolls beneath the fixed bar; on desktop it stays centred in a
  phone-width column instead of stretching
- A guest tapping **Book Ride** is asked to sign in, then the booking continues
  automatically

That last point is a behaviour the existing Travel screen does not have — see
*Fixed*.

### Fixed

**Two buttons that crashed the app.** On the place detail popup, **Save Place**
and **Request Volunteer Here** both threw `TypeError` when clicked. `App.tsx`
was handing the component the wrong prop names. Corrected, and Save now actually
remembers the place.

**Wrong badges on two dashboards.** The driver and business dashboards asked for
badge types that did not exist, so both silently fell back to a grey
"Community Info" label. They now read **RTO Verified Driver** and
**Kumbh Certified**.

**Your passes never loaded from the server.** The app was calling
`/api/passes/user`, which is not a real endpoint — it returns 401. The pass
screen has therefore always shown sample data. Now calls
`/api/passes/user-passes`, which works.

**Failures were invisible.** All five startup data requests ended in an empty
error handler, so if the server was unreachable the app quietly showed sample
data that looked real. Now each failure is logged, and an amber banner tells the
pilgrim which information is sample data, with a Retry button.

**Every animation was dead.** Modals and result cards across six files used
`animate-in`, `fade-in` and `zoom-in-95`. Those come from a plugin that was
never installed, and which does not work with this project's Tailwind version
anyway. The utilities are now defined directly in `src/index.css`, with no new
dependency, and respect the viewer's reduced-motion setting.

**Sign-in input warning.** A React 19 typing error in the OTP boxes.

### Changed

- Pickup and drop point lists moved into `src/data/kumbhData.ts` so the Travel
  screen and the new booking card share one list instead of duplicating it
- New `fetchCollection()` helper in `src/lib/api.ts` that checks the HTTP status
  and the response shape before trusting it

### Infrastructure

**The project had no React type definitions.** `@types/react` and
`@types/react-dom` were never installed, and React does not ship its own. The
practical effect: TypeScript was checking nothing in any component — no props,
no JSX — across all 8,665 lines. This is why the crashing buttons above were
never caught.

With those installed, five real errors surfaced. All five are now fixed, and
`npx tsc --noEmit` passes with **zero errors**.

### Documentation

The single screen-map diagram was replaced with **nine focused diagrams** in
`docs/diagrams/`, after feedback that one image carried too much at once. The
original was 1920x1320 with 244 text labels and 17 screens in one frame.

Each new diagram answers one question and stays readable at full size. Two are
new: an end-to-end request trace, and a build-status map showing what is
genuinely finished. All are hand-written SVG with an edit guide, so they can be
updated without any tooling.

The large original is kept as a printable wall map.

---

## Current status

| | |
| --- | --- |
| Type errors | 0 |
| Pilgrim screens reaching the API | 8 of 11 |
| Screens still on sample data only | Family Safety, Lost & Found |
| Partner and staff dashboards | 4, all still sample data |
| Application runs | Yes — `npm run dev`, then `http://localhost:3000` |

## Open questions

1. **Does the new booking screen replace the existing Travel screen, or sit
   beside it?** It currently sits beside it, reachable by its own URL, so
   nothing existing is disturbed. The two have different navigation bars —
   three items versus five — so they cannot both be the main flow.

2. **Should the three-item bar replace the five-tab bar everywhere?** That is a
   decision about the whole app, not just this screen.

3. **Is the sketch's design direction meant to extend to the other screens?** If
   so, the remaining pilgrim screens should be rebuilt to match it rather than
   polished in their current style.

4. **Data does not survive a restart.** The server keeps everything in memory,
   so passes, rides and reports are lost when it stops. Fine for a demo in one
   sitting; a blocker for anything spanning two days.
