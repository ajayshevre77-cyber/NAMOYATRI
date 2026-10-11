# Changelog

All notable changes to the Namo Yatri frontend.

---

## 2026-10-10 (acceptance fixes: SOS button and Namo AI button)

The headline: **the three failures from the final acceptance check are fixed.**
One SOS press now records exactly one demo report, the button really needs a
3-second hold, it works from the keyboard and with a screen reader, and the
floating Namo AI button that covered parts of Home is gone.

### Fixed: the SOS button

- **One press recorded two reports.** In development, React deliberately runs
  some code twice to expose bugs. The SOS request was started from inside such
  code, so every press sent two reports. The request now starts from a timer
  with a guard, so one hold sends one report. While a report is being recorded,
  further presses are ignored. Afterwards, a new hold works normally.
- **"3 SECONDS" fired after about 2.1 seconds.** The button counted timer ticks,
  which also run slower in background tabs. It now measures real elapsed time
  and fires at 3 seconds, never sooner. Letting go earlier cancels, and the
  screen says no report was recorded.
- **Keyboard users could not use it at all.** Holding Enter or Space now works
  like holding the button. The browser's usual "click" on those keys is
  suppressed, so a keyboard hold cannot also fire a second action.
- **Screen readers heard nothing.** A status message now counts down ("Keep
  holding: 2 seconds left"), says when a hold was cancelled, and announces the
  result, including that emergency services were NOT notified.
- **Touch and mouse both still work.** A held finger is no longer mistaken for a
  scroll, and a long press no longer opens the phone's context menu.

### Removed: the floating Namo AI button

It covered Home's quick-action tiles and place cards on phones. Namo AI still
opens from the button in the top bar on every screen size, and from Home's
*Namo AI Assistant* tile. On phones that top-bar button is now a larger 40×44
target. The extra space reserved at the bottom of Home and Explore for the
floating button is removed; the space for the bottom bar stays.

### How it was checked

- `npm run lint`: 0 errors. `npm run build`: succeeds.
- Security suite **17/17**, ride request suite **14/14**.
- New SOS hold suite, `tests/sos-hold.test.ts`: **9/9**. It covers:
  - one hold giving one report, even with every step run twice as in
    development mode;
  - letting go early;
  - the exact 3-second boundary, including a slow timer;
  - repeated presses;
  - Enter and Space;
  - cancelling by moving away, by the phone, or by losing focus.

  Two deliberately broken copies of the logic fail it: one that can submit
  twice, and one that counts ticks.
- In a browser, in development mode:
  - **Mouse, touch and keyboard holds:** one report each. Early releases
    recorded nothing, and real Space/Enter taps produced no click.
  - **Layout at 320, 360, 390 and 1280px:** every Home tile, place card,
    ride-form control and bottom-bar tab was clear of anything on top.
  - **Console:** no errors.

---

## 2026-10-10 (final pass before the map: emergency wording)

The headline: **the emergency screen no longer suggests that anyone was alerted.**
The app has no link to the District Emergency Operations Center (DEOC), the
police or any ambulance service. The server only stores reports in its own
memory. The screen now says that, every time.

### Fixed: the emergency (SOS) screen

- **After pressing SOS, the app said the ticket was "logged to the DEOC queue".**
  Behind the scenes every report was also marked "dispatched to DEOC". Neither
  was true. The message now reads: **"Demo report recorded. Emergency services
  have NOT been notified, and no one is on the way."** It is followed by
  one-tap 112 and 108 links. The server now marks reports as *recorded, not
  dispatched*.
- **The incident report said it was "Forwarded to Sector Safety Marshal &
  Municipal Health cell".** It was not sent anywhere. The form now says up front
  that it is a demo that reaches no one, and the confirmation says emergency
  services were NOT notified.
- **Three of the four incident categories always failed, silently.** The server
  rejected them, and the app showed nothing. All four now work, and any failure
  is shown on screen. A failed SOS press now also says so and points to 112 /
  108; before, nothing happened.
- **The SOS screen showed a made-up location.** After a press it said
  "Location: Panchavati / Ramkund Ghat Sector (Cell Tower Approximate)",
  wherever you were. The app does not read your location, so it no longer
  shows one.
- **Other unsupported wording removed:**
  - "HIGH-PRIORITY ASSISTANCE" is now "Demo · alerts no one".
  - "medical camp coordination" is gone from the screen's description.
  - The 108 card's "Ambulance & Trauma Medical Base" is now "Emergency
    ambulance number".
  - "Official Emergency Hotlines" is now "Emergency Numbers".
  - An unused Hindi/Marathi/English sentence claiming tickets "are recorded in
    the DEOC" was deleted.

The 112 and 108 call buttons are unchanged.

### Fixed: sign-in and passes

- The phone sign-in note no longer claims a particular "Google Cloud SMS
  gateway". It now says the code is sent through Firebase Authentication, and
  that phone sign-in may not be available in this demo.
- "Your phone number is strictly private" and "official Firebase password reset
  link" are replaced with plain descriptions of what happens.
- On the pass screen, the guest button no longer says "purchase". It reads
  **Continue as guest and get demo pass (no payment)**. A note explains that
  no payment is taken and that the pass is not valid on any real vehicle.

### Fixed: admin top bar on phones

For a signed-in administrator, the view switcher made the top bar wider than
the screen: by 16–52px at 320px wide, and up to 12px at 360px. On phones it is
now a small shield button that opens the same list. On computers it is
unchanged, and nothing about who can see what changed.

### How it was checked

- `npm run lint`: 0 errors. `npm run build`: succeeds.
- Security suite: **17 of 17 pass**, with 2 new scenarios:
  - The emergency API never says a report was dispatched or sent to the DEOC,
    for new reports and for the sample report.
  - The SOS screen's text contains the "NOT been notified" statement and none
    of the old dispatch claims. There is no screen-testing tool in this
    project, so this one reads the screen's source text.
- Both new scenarios fail on the previous version of the code, as they should.
- Ride request suite: **14 of 14 pass**.
- In a browser:
  - A demo SOS press and a demo incident report were recorded only on the local
    demo server. No call was placed and no outside service was contacted.
  - The new messages appeared as written.
  - The admin top bar was measured at 320–390px. Testing it signed in as an
    admin was not allowed, so it was rebuilt from the same markup.

---

## 2026-10-10 (phase 1.5: fixes from the browser check)

The headline: **a browser walk-through of phase 1 found screens that still said
things that were not true, or got in the way on a phone. These are fixed.** The
interactive map is still next.

### Fixed

- **Home said every visitor had an active pass.** The *My Pass* shortcut always
  showed an "Active" badge, even for a guest with no pass. It now appears only
  when the server has returned an active, unexpired pass for the person signed
  in. While their passes are loading, or if they fail to load, it stays hidden.
  The *Emergency SOS* shortcut also lost its "24x7" badge: nothing in the app is
  staffed around the clock.
- **"Continue as Guest" quietly sent a ride request.** On the sign-in popup
  that appears when a guest taps *Request ride*, that button said "Limited
  Public Browsing", but it actually signed the guest in anonymously and sent the
  request. The button now reads **Continue as guest and submit demo ride
  request**. A note above it explains that no driver or vehicle will be
  dispatched.
- **A cancelled ride request could still be sent later.** If a guest closed
  that popup, the request waited in the background and went through the next
  time they signed in, from a popup that never mentioned it. Closing the popup
  now cancels it.
- **The floating Namo AI button covered the *Request ride* button on phones**,
  and on computers it sat hidden behind the bottom bar. It now appears only on
  phones, only on Home and Explore, and sits above the bottom bar. Those two
  screens got extra space at the bottom so it never covers their last item. The
  Namo AI button in the top bar now also shows on phones (as an icon), so Namo
  AI is one tap away on every screen.
- **The top bar did not fit on narrow phones.** At 360px wide the page scrolled
  sideways and the account button was cut off. On phones the three language
  buttons are now one dropdown, and the "Simhastha 2027" tag is dropped (the
  orange strip above already says it). The top bar now fits at 320, 360, 375 and
  390px in all three languages. "NAMO YATRI" shows in full on one line from
  360px; at 320px the English title is shortened with "…" rather than pushing
  the page sideways. Computers look the same as before.

### Changed: removed claims that were not true

- **Place photos showed other places.** Ramkund was a hotel bedroom, and other
  places showed a South Indian temple tower, a forest and a desert canyon. The
  project has no photos verified to show these places, so each now shows a
  plain icon for its type (temple, ghat, and so on) and "No photo yet".
- **The sign-in popup said SOS needs a verified account.** It does not, and it
  must not: the server accepts SOS from anyone. The popup now says the SOS
  screen and its 112 / 108 call buttons work without an account.
- **The 112 card said "Kumbh Security Cell & Police Control".** The app has no
  link to any such cell. It now says "National emergency number". The number
  itself is unchanged.

### How it was checked

- `npm run lint`: 0 errors. `npm run build`: succeeds.
- Security suite: **15 of 15 pass**. New scenario: a guest can file an SOS
  report, so the popup's wording is checked against what the server actually
  does.
- Ride request suite: **14 of 14 pass**.
- In a browser, at 320–390px and 1280px:
  - **Top bar:** fits with no sideways scrolling, in English, Hindi and Marathi.
  - **Ride sign-in popup:** shows the new wording, and no ride request was sent.
  - **Floating AI button:** covers nothing at the end of either screen.
  - **Namo AI:** opens from the top bar and from the floating button.
  - **Console:** no errors.

The driver, volunteer, business and admin dashboards were not changed.

---

## 2026-10-10

The headline: **the app no longer shows anyone a pass that isn't theirs, every
ride type can now be requested, and the app stops claiming things that are not
true.** This is phase 1 of the user-side MVP. The interactive map comes next.

### Security: passes

**Every visitor was shown someone else's pass.** When nobody was signed in, the
server answered "your passes" with a stored sample pass, so every guest saw it
as their own. Signed-in users had the opposite problem: the app never sent their
sign-in with that request, so they also got the sample pass instead of their
own. Now a guest gets no passes and a signed-in user gets only theirs. The list
refreshes when someone signs in or out, so one person's pass never stays on
screen for the next.

**A pass could be looked up by its short reference number alone.** The conductor
check endpoint returned the holder's name for any reference number, and anyone
could use it to spend a stranger's rides. It now also requires the pass's secret
token, and a wrong token gets the same answer as a pass that does not exist.

### Fixed: ride requests

- **Auto, Cab and Bus can now be requested.** Before, only the Electric Shuttle
  worked; the other three were silently rejected.
- **The server decides the fare.** It used to save whatever fare the phone sent.
  It now works the fare out itself and ignores the phone's number. The phone
  shows a preview using the same calculation, so the two always match.
- **Passengers and scheduled times are kept.** Both were collected by the form
  and then thrown away. They are now checked (1–6 passengers, never more than
  the vehicle seats; a time up to 7 days ahead, not in the past) and saved.
- **Clear errors.** Every rejection says what was wrong (for example "That
  departure time has already passed") instead of failing silently. Suspended
  accounts are refused.
- **One booking form.** The Travel tab now uses the same form as the ride
  booking page, including asking a guest to sign in first. The old Travel form
  sent ride types the server refused and hid every error.
- **No more "booking confirmed" theatre.** After a request, the app says plainly:
  *demo request recorded, no driver or vehicle has been dispatched.*

The swap-pickup-and-destination button is hidden for now. The pickup and
destination lists share no places, so swapping always produced an invalid trip.
It comes back automatically once the map work gives both fields one list.

### Changed: removed claims that were not true

Throughout the pilgrim screens, the app had been presenting sample data as
official. Removed or corrected:

- "Verified GPS coordinates", "All official Kumbh sites verified", and the
  "Kumbh Official Verified" badge on every place. Places now show **Not
  verified**, and the two invented facilities (the Sector 3 medical base and
  parking hub P4) are labelled as not real.
- "Government-regulated", "statutory" and "RTO approved" fares, on rides and on
  passes. Fares are now labelled as demo estimates.
- Named real organisations (Red Cross, MSRTC, Bharat Seva Mandal) attached to
  sample volunteers and buses, with made-up accreditation numbers.
- "Request logged into Nashik Transport Partner Registry", "volunteer has been
  notified", "application submitted to Kumbh Seva Registry". None of these
  happened. The volunteer sign-up also used to say "submitted" even when it
  failed; it now shows the real result.
- **Emergency screen:** the SOS button said it alerted the District Emergency
  Operations Center. It does not, and now says so and points to 112 / 108. A
  made-up "Kumbh Control Room" toll-free number that could be dialled from the
  emergency screen is gone.
- Namo AI no longer calls itself official, and when it falls back to its
  built-in answers it now always says so, even when the AI service fails.
- The pass screen's "cryptographically signed QR" claim. The pass token is a
  random code, and the screen now says so.

### How it was checked

- `npm run lint`: 0 errors. `npm run build`: succeeds.
- Security suite: **14 of 14 pass** (4 new scenarios for the pass fixes).
- New ride request suite, `tests/rides.test.ts`: **14 of 14 pass**.
- Run against the code from before this change, the new tests fail where they
  should: 3 pass scenarios and 12 ride scenarios.
- The production build was started and the fixed endpoints were called directly.

The driver, volunteer, business and admin dashboards were not changed.

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
