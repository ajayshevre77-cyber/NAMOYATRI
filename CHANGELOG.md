# Changelog

All notable changes to the Namo Yatri frontend.

---

## 2026-10-21 (Request a demo ride from the map or a trip plan; Trimbak fares fixed)

### What was wrong

- **Rides and the map didn't connect.** A place found on the map, or a stop in
  an AI trip plan, couldn't be used as a ride destination. The ride form only
  offered its own two fixed lists.
- **Leaving the map lost your trip plan.** Switching to another tab threw the
  plan away, so there was no way back to it from the ride form.
- **Some fares used the wrong distance.** The demo fare decided whether a
  place was in Trimbakeshwar by looking for the word "Trimbak" in its name:
  - "Kushavarta Kund Bus Terminal" (in Trimbakeshwar) to Ramkund (in Nashik)
    was priced as an 8.4 km trip, though it is about 28 km;
  - the same terminal to Kushavarta Kund, a short walk, was priced as 28.5 km;
  - Trimbakeshwar Temple Outer Gate to the temple next to it was priced as
    8.4 km.

  In all, 10 of the 64 pickup and drop pairs were mispriced.
- **The form showed a distance and fare before a destination was chosen**,
  and called the distance "approx.", although it was never measured.

### What's new

- **"Request a ride (demo)" on every trip-plan stop.** The stop becomes the
  destination, and the stop before it the pickup. For a day's first stop, the
  pickup is the trip's starting place. If the trip starts at your own
  location, you choose the pickup, because a remembered location may be out
  of date.
- **"Request a ride here (demo)" on map places**: OpenStreetMap places, search
  results and Kumbh sample sites. You choose the pickup.
- **The ride form shows where the ride came from**, with "Show on map" and,
  for a trip stop, "Back to trip plan". The trip plan, your route and the
  selected place are all still there when you go back.
- **Picked places stay what they are.** A place from the map is labelled
  "Place from OpenStreetMap". A sample site says "approximate location", and
  the server keeps it marked approximate. The fixed pickup and drop points
  have no map position, so none is made up for them. Either end can be
  changed back to the list.
- **Fares are priced by area.** Each fixed point now has its area written
  down. A map place's area comes from its position: whichever of Nashik or
  Trimbakeshwar is nearer. The demo distance is a fixed value for each kind
  of trip:
  - within Nashik: 8.4 km;
  - within Trimbakeshwar: 3 km;
  - between the two: 28.5 km.

  The form says plainly that this is a fixed demo value, not measured on a
  map or by road. The estimate updates as soon as either end changes, and
  nothing is shown until both are chosen.
- The server still prices every ride itself and ignores any fare the app
  sends. Every request is still recorded as "requested, not dispatched", and
  no driver or vehicle is sent.

### How it was checked

- `npm run lint`: 0 errors. `npm run build`: succeeds. `git diff --check`:
  clean.
- The ride tests now pass **20/20** (6 new). They cover:
  - all 64 pickup and drop pairs, including the four mispriced ones above;
  - the estimate changing when either end changes;
  - the server's quote matching the form's;
  - a ride from a trip stop and from a map place, recorded with the server's
    fare and not dispatched;
  - a sample site staying approximate;
  - 12 kinds of bad request (missing, bad or out-of-area coordinates, no
    name, an unknown source, the same place twice) refused;
  - no screen claiming a ride is booked or a driver is on the way.
- Fourteen deliberate bugs were added one at a time, and the tests caught
  every one.
- The other suites still pass: security **17/17**, SOS hold **9/9**, map
  **23/23**, place search **15/15**, routing **16/16**, trip planner **20/20**,
  Namo AI **19/19**.
- The ride form was rendered in three states (from a trip stop, from a sample
  site, and opened normally) and its text checked.
- **Not checked in a browser:** the Chrome extension wasn't connected, so
  nothing was clicked through: the buttons, the map's "Show on map" and "Back
  to trip plan", and the map being kept while on other tabs. Submitting a
  request also needs a real sign-in, which was not done; the tests cover the
  recorded request over HTTP instead.

---

## 2026-10-21 (Trip planner: easy to find from Home, cancels cleanly, no stuck routes)

The AI trip planner (1 to 7 days, e.g. a 3-day visit) already existed on the
Map tab. This change makes it easy to find and fixes the problems found while
checking it end to end. No new planner was built.

### What was wrong

- **Hard to find.** The planner sat near the bottom of the Map tab, below the
  map and the route planner. Nothing on Home pointed to it.
- **Cancel only hid the spinner.** The server carried on, still asking the AI
  and calculating up to 7 routes for a plan nobody would see. That used up
  the daily AI and routing allowances.
- **A day could get stuck on "Calculating the road route…".** This happened if
  you moved a stop while its route was loading, then moved it back. The
  spinner never stopped and "Update route" never came back.
- A day whose stops had all been removed also said "One place and no fixed
  start", which made no sense.
- The waiting message said "usually under a minute". Measured today, finding
  places alone takes 20 to 60 seconds, because the free OpenStreetMap place
  service is overloaded.

### What's new

- **A "Plan a trip" card on Home**, just below the welcome panel, in English,
  Hindi and Marathi. Its button opens the Map tab with the planner already in
  view and selected for keyboard and screen-reader users. In Hindi and
  Marathi the card says the planner itself is only in English for now.
- **Cancel really stops the work.** When you cancel, or leave the Map tab,
  the server stops before asking the AI and before each remaining day's
  route. If two tabs asked for the same trip at the same moment, one leaving
  does not stop the other's. After cancelling you see "You cancelled
  planning, so no itinerary was made", and any earlier plan stays on screen.
- **Edited days never show stale routes.** After a stop is moved or removed,
  the day shows only a route calculated for exactly those stops in that
  order, or "Update route". It no longer shows an old line, an old distance,
  an old error or a spinner that never ends.
- **An honest waiting message:** "This can take up to two minutes, mostly
  waiting for the free OpenStreetMap place service", and after a minute,
  "Still working… You can keep waiting or cancel."

Unchanged, and checked again: plans use only real OpenStreetMap places, the
AI only chooses and orders them, road distances and times come only from the
routing service, and with no routing service the plan shows its stops and
says plainly that no road distance or time is available.

### How it was checked

- `npm run lint`: 0 errors. `npm run build`: succeeds. `git diff --check`:
  clean.
- The trip-planner tests now pass **20/20** (3 new, and missing-field cases
  added to the input check). They use stand-ins for Gemini, OpenStreetMap
  and the routing service, never the real ones:
  - a 3-day trip gives exactly 3 days, every stop is one of the real places
    the AI was offered, none repeats, and each day's route starts at the
    chosen starting point;
  - missing days, interests, budget, pace, travel mode or start are refused;
  - edited days never show stale routes, including the stuck-spinner case;
  - cancelling before or during the place lookup, during the AI and during
    routing, and a real browser-style disconnect over HTTP, all stop the
    remaining AI and routing calls.
- Ten deliberate bugs were added one at a time, and the tests caught every
  one.
- The other suites still pass: security **17/17**, rides **14/14**, SOS hold
  **9/9**, map **23/23**, place search **15/15**, routing **16/16**, Namo AI
  **19/19**.
- **In the browser**, on a test copy of the app with a stand-in AI and a
  stand-in routing service:
  - Home → "Plan my trip" → a 3-day plan built from 89 real OpenStreetMap
    places (fetched live today, then replayed), with Day 1 on the map;
  - moving and removing stops, including the stuck-spinner case;
  - the Google Maps link following the edited order;
  - Cancel while places load and while the AI answers (the server log
    confirmed it stopped);
  - "routing not set up" with no distances or times;
  - "AI not set up";
  - the card at 320 and 360 px phone widths in English and Marathi, and in
    Hindi on desktop.
- **Live OpenStreetMap today:** the planner's place lookup took 20 s (walking,
  Nashik), 36 s (driving), and timed out for the Trimbakeshwar area. In the
  browser the first two attempts failed after about 50 s each. The app showed
  a clear error with "Try again" and did not call the AI.
- **Not checked:** real Gemini plans and real road routes. There is no Gemini
  or OpenRouteService key on this machine, so the planner says "AI trip
  planning is not set up" until a key is added.

---

## 2026-10-21 (Namo AI answers questions usefully and handles emergencies)

### What was wrong

- Without the AI service set up (which is the case today), Namo AI answered
  almost every question with "Namaste. I am Namo AI…".
  - That included **"I need an ambulance"** and **"My child is lost"**: no 112
    or 108, no next steps.
  - Three of its five suggested questions got that greeting, and one promised
    a "24x7 medical emergency camp" that does not exist.
- It forgot the conversation, so a follow-up such as "How do I get there?"
  made no sense to it.
- When the server refused a message, the window showed "Thank you for your
  inquiry. Please consult the Kumbh Helpdesk", hiding the error.

### What's new

- **Emergencies are answered first, with fixed safety guidance**, in English,
  Hindi and Marathi.
  - Covered: ambulance and medical emergencies; a missing child or relative,
    or being lost yourself; fire, a crowd surge, drowning or an attack; and
    "help!" or "what do I do in an emergency?".
  - It says to call **112**, or **108** for an ambulance, with a few clear next
    steps and tap-to-call buttons.
  - It says plainly that **Namo Yatri has not contacted anyone**. The AI is
    never asked about an emergency, so it cannot change or delay this
    guidance.
- **Every question gets a relevant answer, or an honest "I don't know".**
  Without the AI, built-in answers cover:
  - travel between Nashik and Trimbakeshwar, and to other places;
  - temples and ghats in the app's sample list (labelled as demo data);
  - finding hospitals, toilets, water, parking and ATMs on the map;
  - how ride requests, passes, volunteers, SOS and Lost & Found work in this
    demo;
  - the tentative Shahi Snan dates, accommodation, crowds and whether the app
    is official.

  Anything else gets "I don't have verified information about that", with
  what Namo AI can help with and where to look instead.
- **Follow-up questions work**: "How do I get there?" or "What are its
  timings?" after asking about a place.
- **Answers come in your language.** A question typed in Hindi or Marathi is
  answered in that language, even if the app is set to English.
- **Every answer says where it came from**: "AI answer (Gemini), may be
  inaccurate, not verified", "Built-in answer from the app", or "Safety
  guidance (not written by AI)".
- **New suggested questions**, each with a real answer: getting to
  Trimbakeshwar, temples near Ramkund, Kushavarta Kund, a Marathi-speaking
  volunteer, a hospital or pharmacy, ride requests, and emergencies. They are
  shown in the app's language.
- **Clear errors.** When something fails, is too slow or is sent too fast, you
  see what happened, a "Try again" button and the 112/108 reminder. You can
  cancel a slow question. Escape closes the window.

### Limits and safeguards

- The AI is given the app's own facts, with demo data labelled as demo. It is
  told never to make up places, facilities, opening times, prices,
  timetables, announcements, bookings or phone numbers other than 112 and 108.
- An AI reply that claims to have contacted someone, or to have booked
  something, is never shown; the built-in answer is shown instead.
- Each person can send 20 messages a minute. The server makes at most 1,000
  AI calls a day for the chat, and at most 4 at once; beyond that, built-in
  answers are given.
- The AI must answer within 20 seconds, or it is cancelled. Each question
  sends at most 6 earlier messages.
- Nothing is stored, and nobody is contacted.

### How it was checked

- `npm run lint`: 0 errors. `npm run build`: succeeds. `git diff --check`:
  clean.
- The new Namo AI tests pass **19/19**. They use a stand-in for Gemini and
  never call the real one. They cover every suggested question in all three
  languages, emergencies in English, Hindi and Marathi, follow-ups, AI
  failures, slow answers, rate limits, the daily cap, bad requests, and that
  the API key never appears in answers or logs.
- Seven deliberate bugs were added one at a time, and the tests caught every
  one:
  - emergency guidance skipped when the AI is set up;
  - Hindi "lost" words missing;
  - earlier messages not sent to the AI;
  - a slow AI call not cancelled;
  - an AI reply claiming an action shown;
  - no daily cap;
  - follow-ups ignoring earlier messages.
- The other suites still pass: security **17/17**, rides **14/14**, SOS hold
  **9/9**, map **23/23**, place search **15/15**, routing **16/16**, trip
  planner **17/17**.
  - One trip-planner timing check (scenario 11) failed once in nine runs. It
    measured 1,499 ms where at least 1,500 ms is required. That code was not
    changed.
- **In the browser**, on a test copy of the app with a stand-in AI:
  - built-in answers and follow-ups;
  - the emergency guidance with call buttons;
  - a labelled AI answer, which received the 6 earlier messages;
  - a slow AI (cancelled, built-in answer, "Try again");
  - a failing AI, then "Try again" once it recovered;
  - the "sending too fast" error;
  - Cancel and Escape;
  - Hindi screens, with a Marathi question answered in Marathi;
  - a 360 px phone width with no sideways scrolling.
- **Not checked:** real Gemini answers. There is no Gemini key on this
  machine.

---

## 2026-10-20 (Place search finds places more reliably)

### What was wrong

- **The Home search showed almost nothing.** Its results list was cut off by
  the dark banner it sits in, so only a 23-pixel sliver was visible, even when
  it had found something. This has been the case since the app was first
  built.
- **Home and Explore searched only the 8 sample places**, and only when the
  whole phrase matched exactly. "Kalaram Mandir", "Ram Kund", "Trimbakeshwar
  Temple", "hospital" and Hindi or Marathi spellings in the English app all
  found nothing.
- **The map search used the spelling exactly as typed.** OpenStreetMap writes
  "Kushawart", "Kalaram Mandir" and "Trimbakeshwar Temple", so "Kushavarta",
  "Kalaram Temple" and "Trimbakeshwar Jyotirlinga" found nothing.
- The three search boxes all matched differently, and "nothing found" gave
  little help.

### What's new

- **One way of matching for Home, Explore and the map's sample sites.** It
  understands:
  - words in any order, and joined or split words ("Ramkund" = "Ram Kund");
  - Mandir = Temple, Tryambak = Trimbak, Kushavarta = Kushavart = Kushawart,
    Nasik = Nashik, and similar spelling differences;
  - Hindi and Marathi names, whatever language the app is in (for example
    रामकुंड, काळाराम मंदिर or कालाराम मंदिर, त्र्यम्बकेश्वर);
  - category words such as "hospital", "parking" or "temples";
  - the start of a word while typing ("Kush").

  It does not guess wildly: "pizza", "airport" or "Mumbai" find nothing.
- **"Did you mean"** offers a corrected spelling when nothing matches, such as
  "Kushvarta" → Kushavarta, and only when the correction finds something.
- **"Search the map for …"** on Home (always) and on Explore (when nothing
  is found) opens the Map tab and searches OpenStreetMap there. It searches
  only when you tap it, never while you type.
- **The map tries one other spelling** when OpenStreetMap finds nothing, and
  says so: "OpenStreetMap had nothing for 'Kalaram Temple', so these are its
  results for 'Kalaram Mandir'."
  - It tries at most one, after the first search, and never at the same time.
  - It never retries when the service is busy, slow or failing.
  - It does not retry for places OpenStreetMap does not have (Sadhu Gram,
    Muktidham).
- **A more helpful "no matches" message on the map**, with tips: check the
  spelling, try "Mandir" instead of "Temple", use the place's name rather
  than a sentence, or use "Search this area".
- The Home search box no longer offers to search "shuttles", which it never
  could.

The list of extra spellings (in `src/lib/placeSearch.ts`) only adds ways of
writing places that already exist. It adds no places, locations, hours or
ratings.

### How it was checked

- `npm run lint`: 0 errors. `npm run build`: succeeds. `git diff --check`:
  clean. All seven test suites pass:
  - security **17/17**, rides **14/14**, SOS hold **9/9**, routing **16/16**,
    trip planner **17/17**;
  - map **23/23** (7 new tests for the second spelling, using a stand-in for
    OpenStreetMap);
  - the new place-search tests **15/15**. They also show that the old Home and
    Explore rules found none of the problem searches.
- Five deliberate bugs were added one at a time, and the tests caught every
  one:
  - Mandir no longer counted as Temple;
  - "Kushavarta" no longer counted as "Kushavart";
  - a match anywhere inside a word was allowed;
  - a second spelling was tried after the service had failed;
  - a second spelling was tried even when the first search found something.
- **Against the real OpenStreetMap search**, on 2026-10-20, four searches
  that found nothing before now find the right place through one other
  spelling:
  - Kalaram Temple → Kalaram Mandir;
  - Kushavarta → Kushawart Tirth;
  - Trimbakeshwar Jyotirlinga → Trimbakeshwar Temple;
  - रामकुंड → Ram Kund.
- **In the browser**, on a test copy of the app with a stand-in OpenStreetMap
  search:
  - Home results show in full, with "Did you mean" and "Search the map".
  - "Search the map" made one search, not two.
  - A suggestion, the second-spelling note, and the "no matches" tips work.
  - Explore works in English and with Hindi spellings.
  - Phone widths of 320 and 360 px, in English and Marathi, have no sideways
    scrolling.

---

## 2026-10-14 (Phase 2C: AI trip planner)

### What's new

- **Plan a trip with Namo AI** on the Map tab, below "Plan a route" (there is
  also a link to it under the map's title). Choose:
  - how many days (1 to 7);
  - where you start: the Nashik–Panchavati or Trimbakeshwar area, a place you
    picked on the map or in search, or your location;
  - your interests (pilgrimage, temples, history, architecture, nature, food,
    shopping, local markets, sightseeing);
  - budget, pace (how many stops a day), and walking or driving.
- Namo AI makes a **day-by-day plan**: a title and a short summary for each
  day, the stops in order, why each stop suits you, and a suggested time
  there.
- Each day shows its **road route**: total distance and travel time, and the
  distance and time from each stop to the next. "Show on map" draws that day
  on the map, with the starting point marked "S".
- **You can change the plan:**
  - Move stops up or down, or remove them.
  - "Update route" recalculates that day's route.
  - Switching Walk/Drive recalculates the day that is on the map.
  - "Regenerate itinerary" asks for a new plan with your current choices.
- **Directions** opens one stop in Google Maps; "Day N in Google Maps" opens
  the whole day there.

### Where the plan comes from

- **Every stop is a real place from OpenStreetMap**, looked up around your
  start: within about 3 km when walking, or 8 km when driving, plus
  Trimbakeshwar or Nashik when that is further away. Only named places count.
- The AI (Google Gemini, the same one the Namo AI chat uses) may only choose
  from that list. If it names a place that is not on the list, that place is
  removed and the plan says so. If it does that too often, or gets the number
  of days wrong, the plan is not shown at all.
- **Names, addresses, locations and opening hours always come from
  OpenStreetMap, never from the AI.** The AI only writes the titles, the
  reasons and the suggested times, and those are labelled as AI suggestions.
  It is told not to claim history, popularity, crowds, timings or prices.
- The Kumbh sample sites (demo listings) are never used in a plan.
- **Gemini is not set up on this machine** (there is no key). Until it is, the
  planner says "AI trip planning is not set up on this server yet" and makes
  nothing up. Road routes still need the OpenRouteService key from Phase 2B.
  Without that key, a plan still shows its stops, but no distances or times.
- The AI receives the list of places and how far each is from your start, but
  not your location. Place lookups use your start rounded to about 100 m, and
  routes use it rounded to about 10 m. Nothing is saved.

### Limits and when something goes wrong

- Each person can make 10 plans per 10 minutes, and the whole server 300 a
  day, because each plan costs a paid AI call and up to 7 route calculations.
  At most 3 plans are made at once.
- Clear messages for each problem. "Try again" appears only where it can
  help, and you can cancel a slow request. If a new plan fails, the previous
  one stays on screen.
  - The map service, the AI service or the routing service is slow or busy.
  - Not enough matching places were found.
  - The AI's answer could not be used.
  - A day's route could not be found.
- If a day's route fails, the other days still get theirs. A day with a
  single stop and no fixed start simply has no route.

### How it was checked

- `npm run lint`: 0 errors. `npm run build`: succeeds. All six test suites
  pass:
  - security **17/17**, rides **14/14**, SOS hold **9/9**, map **16/16**,
    routing **16/16**;
  - the new trip-planner tests **17/17**.

  The new tests use stand-ins for Gemini, OpenStreetMap and the routing
  service. They never call the real ones.
- Five deliberate bugs were added one at a time, and the tests caught every
  one:
  - the number of days was not checked;
  - interests were ignored;
  - the missing-key check was removed;
  - the start was left out of the routes;
  - invented places were kept.
- **In the browser**, on a test copy of the app, using a **stand-in AI on
  this computer** (its text says "MOCK") and the stand-in routing service:
  - The places came from the **real** OpenStreetMap service.
  - Checked: the "not set up" state, a plan with routes on the map,
    reordering, removing, Update route, switching Walk/Drive, the
    invented-place warning, an AI failure with the old plan kept, routing not
    set up, starting from your location (a test location), Cancel, and the
    per-person limit.
  - Phone widths of 320, 360 and 390 px have no sideways scrolling.
  - The real OpenStreetMap service timed out several times during testing,
    and the planner showed its error each time without calling the AI.
- **Not checked:** a real Gemini plan, and real road routes, because there
  are no keys on this machine.

---

## 2026-10-14 (Phase 2B: road routes on the map)

### What's new

- **Plan a route** on the Map tab. Pick a start (your location, or any place
  from search, the map or the nearby list), a destination, and up to 8 stops
  in between. Move stops up or down, remove them, or reverse the whole route.
  Stops stay in the order you set; nothing reorders them.
- **Walk or Drive.** Tap "Get route" and the road route is drawn on the map
  (dotted for walking, solid for driving), with the total road distance, the
  estimated travel time, and the distance and time for each part.
- Switching Walk/Drive on a route that is showing redraws it straight away.
  Changing the stops hides the old route until you tap "Update route", so an
  old line is never shown for new stops.
- **Directions in Google Maps** opens the same stops in Google Maps for
  turn-by-turn navigation. It works even when Namo Yatri's own routing is
  not set up.

### Where the routes come from

- Routes and times come from **OpenRouteService** (run by HeiGIT in
  Heidelberg), using OpenStreetMap roads. The app uses the new
  `api.heigit.org` address; the old address is being shut down in November.
- It needs a free key, kept on the server only. **No key is set on this
  machine yet**, so the planner says "Road routes are not set up on this
  server yet" and shows no distances or times. Nothing is ever made up.
- Times assume a steady pace or ordinary traffic. The app says plainly that
  Kumbh police traffic plans, closed roads and crowds can change both the
  route and the time. Routes to Kumbh sample sites are marked approximate,
  because those sites' locations are.
- To calculate a route, the stops are sent to OpenRouteService. Your own
  location is rounded to about 10 m first. Your exact position never leaves
  the phone.

### When something goes wrong

- Clear messages for: no route between the stops, a stop too far from any
  road, the routing service being busy, slow or unreachable, the daily
  allowance being used up, and routing not being set up. "Try again" appears
  only where trying again can help, and you can cancel a slow request.
- The same route asked twice is calculated once (on the server for 6 hours,
  and on the phone for the visit), and the server spaces its requests to
  stay inside the free plan's 40 a minute.

### How it was checked

- `npm run lint`: 0 errors. `npm run build`: succeeds. Security **17/17**,
  rides **14/14**, SOS hold **9/9**, map **16/16**, and the new routing tests
  **16/16**. The routing tests never call the real service.
- Four deliberate bugs were added one at a time (line drawn with latitude and
  longitude swapped, coordinates sent swapped, the missing-key check removed,
  stops reordered). The tests caught every one.
- In the browser: with no key, the "not set up" state and the Google Maps
  link. Then, against a **stand-in routing service on this computer** (made-up
  route shapes, not real roads): drawing, totals and each leg, Walk/Drive,
  adding, moving and removing stops, "Update route", errors and "Try again",
  Cancel, starting from your location, and phone widths of 320, 360 and
  390 px with no sideways scrolling.
- **Not yet checked with real OpenRouteService routes**, because no key is
  available here. That needs a key in `.env` and one more browser check.

---

## 2026-10-14 (new fonts, and pinch-to-zoom works again)

### New fonts

- **Body text is now Hind** and **headings are now Yatra One**: the NAMO YATRI
  title, every screen heading and the big greeting on Home. Both fonts were
  designed for English and Devanagari together, so Hindi and Marathi now match
  the English instead of falling back to whatever the phone has.
- Until now the app had no fonts of its own. It asked Google for three fonts
  but never used them, so every device showed its own default.
- Yatra One comes in only one weight, so headings show it as drawn rather than
  with a fake bold added by the browser.
- If Google's font service can't be reached, the phone's own fonts are used
  and everything still works.

### Pinch-to-zoom

- Pilgrims can now pinch to zoom the app. It was blocked before, which made
  small text hard for older pilgrims to read.
- On iPhones, tapping a form field with small text may now zoom the page in a
  little. Pinch out to return. Making those fields 16 px would stop it.

### How it was checked

- `npm run lint`: 0 errors. `npm run build`: succeeds. Security **17/17**,
  rides **14/14**, SOS hold **9/9**, map **16/16**.
- In the browser, both fonts load and apply. The top bar still fits at 320,
  360 and 390 px in English, Hindi and Marathi; as before, only the English
  title is shortened, at 320 px. Hindi letters in the top bar are not clipped.
- Every screen was then checked by hand, as listed in the entry below.

### Full check of every screen (2026-10-14)

All pilgrim screens open from the bottom bar and from the Home tiles, in all
three languages, at 320 px and 1280 px, with no sideways scrolling and no
errors:

- **Home**: all 11 tiles open the right screen.
- **Explore**: filters, search and its empty state; the place window opens,
  saves and closes.
- **Map**: map tiles, "Near Ramkund" (174 real places), filters, place details
  and search all work.
- **Travel**: validation, prices that change with route and ride type,
  passengers and scheduling. "Request ride" asks you to sign in, and closing
  that window sends nothing.
- **Pass**: no pass is shown for a guest, and "Get demo pass" asks you to sign
  in.
- **SOS**: letting go early cancels. A full hold records one demo report after
  3.0 seconds and says plainly that emergency services were NOT notified.
- **Volunteers, Family Safety, Lost & Found, Account, Namo AI**: all open and
  respond. Namo AI says its answers are built in, because no AI key is set.
- **Partner and staff dashboards**: Driver, Volunteer, Business and Admin, as
  previews in development mode. All open, fit a 360 px phone, and their
  buttons respond.

Problems found during the check and **not fixed yet**:

1. **Volunteers:** a guest who taps "Send request (demo)" gets no response.
   The server rejects it because the guest isn't signed in, and the screen
   says nothing.
2. **Family Safety:** the "Call" buttons dial made-up mobile numbers such as
   +91 98220 11111. Those may belong to real people.
3. **Lost & Found:** two more made-up numbers, and a "Police Chowki" call
   button whose number can't be dialled as written and hasn't been checked.
4. **Screen readers:** the Save, Share and Close buttons in the place window
   (on phones), and the Close button on the sign-in window, have no name.
5. **Keyboard:** the place window doesn't close with Esc, and the "Lost Person
   & Lost Item Desk" card on the SOS screen can't be reached with Tab.
6. **Namo AI:** one suggested question still says "24x7 medical camp".

---

## 2026-10-14 (ride booking page merged into the Travel tab)

The separate ride booking page from the sketch (opened with `?screen=ride`) is
now part of the main app's **Travel** tab.

### Why

That page had become cut off from the rest of the app:

- Nothing in the app linked to it. You had to type the address.
- It had no top bar, so there was no language switch, Namo AI, SOS Help or
  account button.
- Its bottom bar did nothing: the buttons only moved the highlight. It also
  highlighted **Pass** while you were booking a ride.
- It was English only.
- It had a second bottom bar, with the same buttons as the main one in a
  different order.

The booking form on it was already the same form the Travel tab uses, so no
booking feature was lost.

### What changed

- The **advertisement slot** from the sketch is now on the Travel tab, between
  the heading and the "Ride requests are a demo" notice. It shows an empty
  "Advertisement" space until a real ad is supplied.
- The old address `?screen=ride` still works. It opens the normal app on the
  Travel tab, with the top bar and the usual bottom bar.
- The separate page and its second bottom bar are gone. The raised centre
  **Pass** button went with them; whether the main bar should have one is now
  an open question (see the end of this file).

### How it was checked

- `npm run lint`: 0 errors. `npm run build`: succeeds. Security suite
  **17/17**, ride suite **14/14**, SOS hold suite **9/9**, map suite **16/16**.
- In the browser: `?screen=ride` opens the Travel tab with the top bar, and the
  Home, Pass and Travel buttons all work from there. Switching to Hindi works
  on that screen. The plain address still opens Home.
- At 320, 360, 390 and 1280 px wide: no sideways scrolling, the top bar fits,
  the ad slot fits the screen, none of the 11 form controls is covered by the
  bottom bar, and the last item on the screen clears it. No errors from the
  app in the console.
- No ride request was submitted and nobody signed in during the check.

---

## 2026-10-14 (Phase 2A: real map and nearby places)

The headline: **the Map tab is now a real, zoomable map, and it can list real
places nearby.** The old screen was a grid of buttons labelled "not a map".

### New: a real map

- The map comes from **OpenStreetMap**, the free community-made world map. You
  can drag it, pinch or tap + and − to zoom. The "© OpenStreetMap
  contributors" credit is always visible in its corner, as their rules require.
- The map opens on the whole Nashik–Trimbakeshwar area. It **never pretends to
  know where you are**: no "you are here" dot appears until you allow it.

### New: "Use my location"

- Tap the target button on the map (or "Use my location" in the list). Your
  browser asks first. Only if you allow it does a blue dot appear, with a
  circle showing how accurate the reading is.
- If you say no, if the phone cannot find you, or if it takes too long, the
  screen says so in plain words and offers "Try again" where that could help.
  If you are outside the Nashik–Trimbakeshwar area, it says how far away you
  are instead of showing an empty map.
- Your exact position never leaves your phone. The nearby search sends only a
  point rounded to about 100 m, and nothing links it to your account.

### New: nearby places and search

- Choose a starting point: your location, a place you searched for, "Near
  Ramkund", "Near Trimbakeshwar", or move the map and tap **"Search this
  area"**. The list then shows real places within 500 m, 1, 2 or 5 km, nearest
  first, with the distance to each.
- Filters: temples and other places of worship, attractions, food, medical,
  toilets, drinking water, parking, and ATMs/banks.
- Tap a place on the map or in the list to see what OpenStreetMap knows about
  it: its type, the address and opening hours if a contributor entered them,
  and links to view it on OpenStreetMap or open it in Google Maps.
- The search box finds places in the Nashik–Trimbakeshwar area by name.

### What is real and what is demo

- **Real (live):** the map itself, nearby places, and search results. All come
  from OpenStreetMap. Volunteers map these places, so the app labels them
  "OpenStreetMap · community data" and says that nobody from Namo Yatri or the
  Kumbh administration has checked them. Some places are missing or unnamed,
  and opening hours can be out of date. The list shows how recent the data is.
- **Demo:** the 9 Kumbh sites we already had (Ramkund, Kushavarta and the
  others). They stay on the map with a dashed outline, are labelled "Sample ·
  demo data", and keep their "approximate location" warning. They never appear
  under a facility filter, so a demo medical camp cannot sit among real
  clinics.
- **Not built yet:** routes and walking directions. Distances are straight-line
  and say so.

### When the free services are busy

The free OpenStreetMap place service is often overloaded. When it is, the app
waits up to about half a minute, tries a second free server, and then says
plainly that nearby places could not be loaded, with a "Try again" button. The
demo sites stay listed. It never shows half a list as if it were complete.

### How it was checked

- `npm run lint`: 0 errors. `npm run build`: succeeds. The map loads only when
  the Map tab is opened, so the rest of the app does not get heavier.
- Security suite **17/17**, ride suite **14/14**, SOS hold suite **9/9**.
- New map suite, `tests/geo.test.ts`: **16/16**, with the real services
  replaced by a stand-in. It covers distances, categories, rounding of your
  location, caching, the busy-server fallback and pause, half-finished replies,
  timeouts, and search limits. Three deliberately broken versions of the code
  each failed it.
- In Chrome, against the real services: the map, the Ramkund and Tapovan
  searches, filters, tapping places on the map and in the list, "Search this
  area" and radius changes all worked. Two of the seven live lookups hit an
  overloaded server and showed the error and "Try again", which then worked.
  The location messages were checked by simulating each browser answer (allowed,
  denied, too slow, outside the area), not by changing this browser's real
  permission. Layout was checked at 320, 360 and 390 px wide (no sideways
  scrolling) and at desktop width.

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

1. **Should the main bottom bar get the sketch's raised centre Pass button?**
   The separate booking screen that had it was merged into the Travel tab on
   2026-10-14, so the app now has one bottom bar. Adding the raised button
   would change every screen.

2. **Is the sketch's design direction meant to extend to the other screens?** If
   so, the remaining pilgrim screens should be rebuilt to match it rather than
   polished in their current style.

3. **Data does not survive a restart.** The server keeps everything in memory,
   so passes, rides and reports are lost when it stops. Fine for a demo in one
   sitting; a blocker for anything spanning two days.
