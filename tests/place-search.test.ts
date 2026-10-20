import { MOCK_PLACES } from '../src/data/kumbhData';
import {
  PLACE_ALIASES,
  alternativeSearchQuery,
  searchSamplePlaces,
  suggestSampleQueries,
} from '../src/lib/placeSearch';
import { Place } from '../src/types';

// Local place search (src/lib/placeSearch.ts), shared by Home, Explore and
// the map's sample-site matches. No server and no network: run with
//   npx tsx tests/place-search.test.ts
//
// The queries come from the 2026-10-20 audit, where Home and Explore found
// nothing for them. Scenario 1 keeps a copy of those old rules to show they
// fail; the rest must keep failing for a matcher that loses word order,
// Mandir/Temple, joined words, transliteration or Hindi/Marathi names, or that
// matches unrelated queries.

/** The Home search box before this change: the whole phrase in one name or the area. */
const legacyHomeSearch = (places: Place[], query: string, lang: 'en' | 'hi' | 'mr') =>
  places.filter(p =>
    p.name[lang]?.toLowerCase().includes(query.toLowerCase()) ||
    p.name.en.toLowerCase().includes(query.toLowerCase()) ||
    p.location.area.toLowerCase().includes(query.toLowerCase()));

/** The Explore search box before this change: as Home, plus the English description. */
const legacyExploreSearch = (places: Place[], query: string, lang: 'en' | 'hi' | 'mr') => {
  const q = query.trim().toLowerCase();
  return places.filter(p =>
    p.name[lang]?.toLowerCase().includes(q) ||
    p.name.en.toLowerCase().includes(q) ||
    p.location.area.toLowerCase().includes(q) ||
    p.description.en.toLowerCase().includes(q));
};

const ids = (query: string) => searchSamplePlaces(MOCK_PLACES, query).map(p => p.id);
const first = (query: string) => ids(query)[0];
const only = (query: string, id: string) => {
  const found = ids(query);
  return found.length === 1 && found[0] === id;
};

async function runPlaceSearchTestSuite() {
  console.log('=================================================================');
  console.log('NAMO YATRI PLACE SEARCH TEST SUITE (15 SCENARIOS)');
  console.log('=================================================================\n');

  let passed = 0;
  let failed = 0;

  async function assertTest(scenarioNum: number, name: string, fn: () => { success: boolean; details?: string }) {
    try {
      const res = fn();
      if (res.success) {
        console.log(`[PASS] Test ${scenarioNum}: ${name}`);
        if (res.details) console.log(`       -> ${res.details}`);
        passed++;
      } else {
        console.error(`[FAIL] Test ${scenarioNum}: ${name}`);
        if (res.details) console.error(`       -> ${res.details}`);
        failed++;
      }
    } catch (err: any) {
      console.error(`[ERROR] Test ${scenarioNum}: ${name} threw error:`, err.message);
      failed++;
    }
  }

  /** Each query → whether `check` holds for it, with a readable summary. */
  const everyQuery = (queries: string[], check: (query: string) => boolean) => {
    const failing = queries.filter(q => !check(q));
    return {
      success: failing.length === 0,
      details: failing.length === 0
        ? `${queries.length} queries ok`
        : `failing: ${failing.map(q => `"${q}" → [${ids(q).join(', ')}]`).join('; ')}`,
    };
  };

  await assertTest(1, 'The audit queries that Home and Explore used to miss now find the right sample place', () => {
    const cases: [string, string][] = [
      ['Kalaram Mandir', 'kalaram_mandir'],
      ['Ram Kund', 'ramkund_panchavati'],
      ['Trimbakeshwar Temple', 'trimbakeshwar_mandir'],
      ['hospital', 'central_medical_unit_sector3'],
      ['रामकुंड', 'ramkund_panchavati'],
      ['काळाराम मंदिर', 'kalaram_mandir'],
    ];
    const oldHomeMisses = cases.every(([q]) => legacyHomeSearch(MOCK_PLACES, q, 'en').length === 0);
    const oldExploreMisses = cases.every(([q]) => legacyExploreSearch(MOCK_PLACES, q, 'en').length === 0);
    const nowFound = cases.filter(([q, id]) => first(q) !== id);
    return {
      success: oldHomeMisses && oldExploreMisses && nowFound.length === 0,
      details: `old Home rule found none: ${oldHomeMisses}; old Explore rule found none: ${oldExploreMisses}; ` +
        (nowFound.length === 0 ? 'shared matcher finds all 6' : `still missing: ${nowFound.map(([q]) => q).join(', ')}`),
    };
  });

  await assertTest(2, 'Mandir and Temple are the same word, in any order, case or spacing', () => {
    const kalaram = everyQuery(
      ['Kalaram Mandir', 'Kalaram Temple', 'Temple Kalaram', 'kala ram mandir', 'Shri Kalaram', '  KALARAM   temple '],
      q => only(q, 'kalaram_mandir'),
    );
    // Places with no alias and no temple category: only the Mandir = Temple rule can match these.
    const testPlace = (id: string, name: string): Place => ({
      ...MOCK_PLACES[0],
      id,
      category: 'attraction',
      name: { en: name, hi: name, mr: name },
      description: { en: 'Test place.', hi: 'Test place.', mr: 'Test place.' },
      facilities: [],
    });
    const fixtures = [testPlace('test_temple', 'Sundarnarayan Temple'), testPlace('test_mandir', 'Someshwar Mandir')];
    const generic =
      searchSamplePlaces(fixtures, 'Sundarnarayan Mandir')[0]?.id === 'test_temple' &&
      searchSamplePlaces(fixtures, 'Someshwar Temple')[0]?.id === 'test_mandir';
    return { success: kalaram.success && generic, details: `${kalaram.details}; without aliases too: ${generic}` };
  });

  await assertTest(3, 'Ram Kund and Ramkund: joined, split, reordered or half typed', () => {
    const ramkund = everyQuery(['Ram Kund', 'Ramkund', 'ramkund ghat', 'kund ram', 'ramk'], q => only(q, 'ramkund_panchavati'));
    // Joined with no common ending to split on: "Lakshman Rekha" typed as one word.
    const joined = only('Lakshmanrekha', 'tapovan_sacred_groves') && only('sadhugram', 'sadhu_gram_tent_city');
    return { success: ramkund.success && joined, details: `${ramkund.details}; Lakshmanrekha and sadhugram: ${joined}` };
  });

  await assertTest(4, 'Kushavarta, Kushavart, Kushawart, Kushavarta Kund and Kushavarta Tirtha all find Kushavarta Kund', () =>
    everyQuery(
      ['Kushavarta', 'Kushavarta Kund', 'Kushavart', 'Kushawart', 'Kushavart Tirth', 'Kushavarta Tirtha', 'kushavartakund', 'kund kushavarta', 'kush'],
      q => only(q, 'kushavarta_kund'),
    ));

  await assertTest(5, 'Tryambak and Trimbak are the same; the temple comes first', () => {
    const temple = everyQuery(
      ['Tryambak', 'Trimbak', 'Tryambakeshwar', 'Trimbakeshwar', 'Jyotirlinga Trimbakeshwar', 'tryambakeshwar jyotirling'],
      q => first(q) === 'trimbakeshwar_mandir',
    );
    const exact = only('Trimbakeshwar Temple', 'trimbakeshwar_mandir') && only('Tryambakeshwar Mandir', 'trimbakeshwar_mandir');
    const town = ids('Trimbak').includes('kushavarta_kund');
    return {
      success: temple.success && exact && town,
      details: `${temple.details}; "Trimbakeshwar Temple" only the temple: ${exact}; "Trimbak" also lists Kushavarta (in Trimbak): ${town}`,
    };
  });

  await assertTest(6, 'Hindi and Marathi spellings work whatever the app language', () =>
    everyQuery(
      [
        'रामकुंड:ramkund_panchavati',
        'राम कुंड:ramkund_panchavati',
        'काळाराम मंदिर:kalaram_mandir',
        'कालाराम मंदिर:kalaram_mandir',
        'त्र्यंबकेश्वर:trimbakeshwar_mandir',
        'त्र्यम्बकेश्वर:trimbakeshwar_mandir',
        'कुशावर्त:kushavarta_kund',
        'कुशावर्त तीर्थ:kushavarta_kund',
        'साधुग्राम:sadhu_gram_tent_city',
        'साधू ग्राम:sadhu_gram_tent_city',
        'तपोवन:tapovan_sacred_groves',
      ],
      entry => {
        const [query, id] = entry.split(':');
        return first(query) === id;
      },
    ));

  await assertTest(7, 'Category words find the category: hospital, parking, temples', () => {
    const medical = ['hospital', 'Hospitals', 'clinic', 'अस्पताल', 'रुग्णालय'].every(q => only(q, 'central_medical_unit_sector3'));
    const parking = only('parking', 'outer_parking_p4_adgaon');
    const temples = ['temples', 'Temple', 'मंदिर'].every(q => {
      const found = ids(q);
      return found.length === 2 && found.includes('trimbakeshwar_mandir') && found.includes('kalaram_mandir');
    });
    return { success: medical && parking && temples, details: `medical ${medical}, parking ${parking}, temples (and no ghats) ${temples}` };
  });

  await assertTest(8, 'Unrelated, too short and filler-only queries match nothing', () => {
    const empty = ['pizza', 'airport', 'Mumbai', 'xyz', 'Delhi Gate', 'hotel', 'ra', 'the', 'shri', '', '   '];
    const wrong = empty.filter(q => ids(q).length > 0);
    // "Sita" must not match "situated" in the Trimbakeshwar description.
    const sita = only('sita', 'kalaram_mandir');
    return {
      success: wrong.length === 0 && sita,
      details: wrong.length === 0 ? `${empty.length} queries matched nothing; "sita" → Kalaram only: ${sita}` : `matched: ${wrong.map(q => `"${q}" → ${ids(q)}`).join('; ')}`,
    };
  });

  await assertTest(9, 'Facility and description matches show only when nothing matches by name, area or category', () => {
    const ramkund = ids('Ramkund').join(',');
    const toilets = ids('toilets').join(',');
    return {
      success: ramkund === 'ramkund_panchavati' && toilets === 'ramkund_panchavati,outer_parking_p4_adgaon',
      details: `"Ramkund" → ${ramkund} (the parking hub mentions Ramkund only in its description); "toilets" → ${toilets}`,
    };
  });

  await assertTest(10, 'Results are deterministic and the place list is not changed', () => {
    const before = MOCK_PLACES.map(p => p.id).join(',');
    const a = ids('Trimbak').join(',');
    const b = ids('  TRIMBAK ').join(',');
    const reversed = searchSamplePlaces([...MOCK_PLACES].reverse(), 'Tryambakeshwar')[0]?.id;
    return {
      success: a === b && a.length > 0 && MOCK_PLACES.map(p => p.id).join(',') === before && reversed === 'trimbakeshwar_mandir',
      details: `"Trimbak" → ${a}; best match with the list reversed: ${reversed}`,
    };
  });

  await assertTest(11, 'Spelling suggestions correct a typo, and every suggestion finds a place', () => {
    const cases: [string, string][] = [
      ['Kushvarta', 'Kushavarta'],
      ['Kalaram Tempel', 'Kalaram Temple'],
      ['Ramkand', 'Ramkund'],
      ['Trimbakeswar', 'Trimbakeshwar'],
      ['hospitl', 'hospital'],
    ];
    const wrong = cases.filter(([q, expected]) => {
      const suggestions = suggestSampleQueries(MOCK_PLACES, q);
      return suggestions[0] !== expected || suggestions.some(s => searchSamplePlaces(MOCK_PLACES, s).length === 0);
    });
    return {
      success: wrong.length === 0,
      details: wrong.length === 0
        ? cases.map(([q]) => `${q} → ${suggestSampleQueries(MOCK_PLACES, q).join(' / ')}`).join('; ')
        : `wrong: ${wrong.map(([q]) => `${q} → ${JSON.stringify(suggestSampleQueries(MOCK_PLACES, q))}`).join('; ')}`,
    };
  });

  await assertTest(12, 'No suggestion for unrelated words, short words or a query that already matches', () => {
    const queries = ['pizza', 'airport', 'Mumbai', 'xyz', 'Ramkund', 'Kalaram Mandir'];
    const wrong = queries.filter(q => suggestSampleQueries(MOCK_PLACES, q).length > 0);
    return { success: wrong.length === 0, details: wrong.length === 0 ? `${queries.length} queries, no suggestions` : `suggested for: ${wrong.join(', ')}` };
  });

  await assertTest(13, 'Server alternative spelling: known places get the spelling OpenStreetMap uses, Temple swaps with Mandir', () => {
    const cases: [string, string][] = [
      ['kalaram temple', 'Kalaram Mandir'],
      ['kushavarta', 'Kushawart'],
      ['kushavarta kund', 'Kushawart'],
      ['कुशावर्त', 'Kushawart'],
      ['रामकुंड', 'Ram Kund'],
      ['trimbakeshwar jyotirlinga', 'Trimbakeshwar Temple'],
      ['tryambakeshwar mandir', 'Trimbakeshwar Temple'],
      ['तपोवन', 'Tapovan'],
      ['sundarnarayan temple', 'sundarnarayan mandir'],
      ['sundarnarayan mandir', 'sundarnarayan temple'],
    ];
    const wrong = cases.filter(([q, expected]) => alternativeSearchQuery(q) !== expected);
    return {
      success: wrong.length === 0,
      details: wrong.length === 0 ? `${cases.length} alternatives ok` : `wrong: ${wrong.map(([q]) => `${q} → ${alternativeSearchQuery(q)}`).join('; ')}`,
    };
  });

  await assertTest(14, 'Server alternative spelling: none for the OpenStreetMap spelling itself, places not in OpenStreetMap, or unrelated words', () => {
    const queries = ['kalaram mandir', 'kushawart', 'trimbakeshwar temple', 'tapovan', 'sadhu gram', 'muktidham', 'pizza', 'hospital', 'trimbakeshwar', ''];
    const wrong = queries.filter(q => alternativeSearchQuery(q) !== null);
    return { success: wrong.length === 0, details: wrong.length === 0 ? `${queries.length} queries, no alternative` : `alternatives for: ${wrong.map(q => `${q} → ${alternativeSearchQuery(q)}`).join('; ')}` };
  });

  await assertTest(15, 'The alias list only adds spellings: every sample id exists, and no coordinates, hours or ratings', () => {
    const knownIds = new Set(MOCK_PLACES.map(p => p.id));
    const unknown = PLACE_ALIASES.flatMap(a => a.samplePlaceIds).filter(id => !knownIds.has(id));
    const extraKeys = PLACE_ALIASES.flatMap(a => Object.keys(a)).filter(k => !['name', 'spellings', 'samplePlaceIds', 'osmQuery'].includes(k));
    return {
      success: unknown.length === 0 && extraKeys.length === 0 && PLACE_ALIASES.every(a => a.name && a.spellings.length > 0),
      details: `${PLACE_ALIASES.length} aliases; unknown ids: ${unknown.length}; other fields: ${extraKeys.length}`,
    };
  });

  console.log('\n=================================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL ${passed + failed})`);
  console.log('=================================================================');

  process.exit(failed > 0 ? 1 : 0);
}

runPlaceSearchTestSuite().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
