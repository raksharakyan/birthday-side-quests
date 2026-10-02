/**
 * Every officially assigned ISO 3166-1 alpha-2 code (249). Names come from Intl.DisplayNames at
 * runtime, so nothing here needs translating and no network request is involved.
 */
export const ISO_COUNTRIES: readonly string[] = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
  'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP ' +
  'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT ' +
  'MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW ' +
  'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG ' +
  'UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' ');

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    return null;
  }
})();

/** English country name for an ISO-2 code; falls back to the code itself. */
export function countryName(code: string): string {
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

export interface CountryOption {
  code: string;
  name: string;
  /** Online quests shown for this country (its own plus worldwide); null when it has none of its own. */
  count: number | null;
}

/**
 * Options for the Online tab's country select: countries with their own online quests first (with a
 * count), then every other country. Both groups sorted by English name. `extra` adds a code that is not
 * in the ISO list (e.g. "XK" from a geocoder).
 */
export function countryOptions(
  byCountry: ReadonlyMap<string, number>,
  worldwide: number,
  extra?: string | null,
): { withQuests: CountryOption[]; others: CountryOption[] } {
  const codes = new Set(ISO_COUNTRIES);
  for (const c of byCountry.keys()) if (/^[A-Z]{2}$/.test(c)) codes.add(c);
  if (extra && /^[A-Z]{2}$/.test(extra)) codes.add(extra);
  const all = [...codes].map((code) => {
    const own = byCountry.get(code) ?? 0;
    return { code, name: countryName(code), count: own > 0 ? own + worldwide : null };
  });
  all.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return { withQuests: all.filter((o) => o.count !== null), others: all.filter((o) => o.count === null) };
}
