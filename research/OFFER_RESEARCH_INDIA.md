# Offer Research: India batch

Research pass: **2026-10-02**. Data file: `research/offers.batch-india.json` (28 new entries: 16 verified, 12 unverified).

Method: same as `docs/OFFER_RESEARCH.md`. Web search was used only to find candidates and official URLs. Every entry is sourced to the brand's own domain or official help centre. Pages that blocked WebFetch were read as public pages in the built-in browser (read-only, no sign-in, no forms). Text is paraphrased. An entry is **verified** only when the official page states what the reward is. If a page confirms a birthday perk but gives no value, the entry is marked **unverified** and the offer text is kept cautious.

## Findings

| Brand | Official URL | What the page says (paraphrase) | Verdict | Notes |
|---|---|---|---|---|
| Lakmé Salon | https://www.lakmesalon.in/pages/runway-terms-and-conditions | Runway Rewards birthday treat: 15% off services (Silver Starlet, Golden Goddess, Platinum Diva) or 30% off (Stunning Showstopper). Usable once a year, from 15 days before the birthday up to the birthday. The DOB must be on file at least 1 day before. | ✅ verified | Membership needs ₹1,000+ spend in 12 months. |
| Forest Essentials | https://www.forestessentialsindia.com/soundarya-club-faqs | Soundarya Club birthday coupon: Bronze 10% (max ₹500), Silver 10% (max ₹750), Gold 15% (max ₹1,000), Platinum 15% (max ₹1,500). Issued on the 1st of the birthday month and valid that month. The DOB must be updated a week before. Can't be combined with other offers. | ✅ verified | Club starts at ₹5,000 cumulative spend. WebFetch returned 403, so the page was read in the browser. |
| Wonderla | https://www.wonderla.com/offers/birthday-offer-wonderla | Buy 1 Get 1 free ticket for the birthday celebrant. Guests born in the month of the visit qualify. Book online at all 5 parks. Listed until 31 Mar 2027. | ✅ verified | The older `/offers/birthdays-at-wonderla.html` URL now redirects home. |
| ITC Hotels (Club ITC) | https://www.itchotels.com/in/en/clubitc/membership-benefits | Gold, Platinum, Platinum Select and Culinaire members earn 2x Green Points on F&B in their birthday week. Not credited when you pay with points or through aggregators. | ✅ verified | Points bonus, not a freebie. |
| Imagicaa | https://www.imagicaaworld.com/tickets-and-offers/ | The birthday person gets a free Express ticket (Theme or Water Park) and a return gift. At least 4 companions must pre-book Regular tickets online. The upgrade is claimed at the park counter. | ✅ verified | |
| Timezone | https://www.timezonegames.com/en-in/rewards/ | Birthday Treat: Blue Elite 200 tickets; Gold 500 bonus + 200 tickets; Platinum 1,000 bonus + 1,000 tickets. The DOB must be registered 7+ days before the 1st of the birthday month. The voucher appears in the Fun App, is valid for 1 month, and is given once per member. | ✅ verified | Welcome-card tier gets no birthday treat. |
| Costa Coffee | https://www.costacoffee.in/legal-and-data-privacy/costa-club-terms | Costa Club India T&C: a free birthday cake. Only members with a transaction in the past 12 months qualify. | ✅ verified | No redemption window stated. WebFetch timed out, so the page was read in the browser. |
| Bata | https://www.bata.com/in/bata_club.html | Bata Club "Birthday Surprise": a gift voucher worth up to ₹750 in the birthday month, sent by SMS. You must have updated your birthday. | ✅ verified | Value is "up to". The page doesn't say whether stores, online or both accept it. |
| Marks & Spencer | https://www.marksandspencer.in/loyalty_page.html | Sparks birthday benefit: Club 10%, Premier 15%, Elite 20%. Valid for the whole calendar month. Redeem in store or online. | ✅ verified | |
| Swarovski | https://www.swarovski.com/en-IN/s-sclanding/Swarovski-Club/ | Every Swarovski Club tier (Bronze through Crystal) lists a 20% off birthday coupon. Members share their birthday to get a surprise. | ✅ verified | The India page doesn't say where the coupon can be redeemed. The channel is set to online to be safe. |
| Wet'nJoy (Lonavala) | https://www.lonavala.wetnjoy.in/offers/birthday-bash/ | Free entry for the birthday person in the birthday month, about 5 days either side. You need 4 to 10 companions, and they get 10% off. Online booking only, at least 24 hours ahead. Original government ID required. One free ticket per year. | ✅ verified | Also includes a badge, a brownie and a selfie point. |
| Global Desi | https://www.globaldesi.in/rise-rewards.html | RISE Rewards birthday treat: Insider 10%, Trendsetter 20%, plus 5% more on shopping above ₹15,000. The coupon is sent 14 days before the birthday and is valid 30 days. The DOB must be added 30+ days ahead. Apparel only. | ✅ verified | The Muse tier gets no birthday treat. The redemption channel isn't stated. |
| AND | https://www.andindia.com/rise-rewards.html | Same RISE Rewards birthday terms as Global Desi (both are House of Anita Dongre brands). | ✅ verified | osm omitted: the store name "AND" is too generic for a safe regex. |
| Water Kingdom | https://www.waterkingdom.in/offers/birthday-bash-offer.html | Free entry for the birthday person on the birthday or up to 3 days after. 48% off for 3 to 4 companions, and at least 3 companion tickets are required. Government photo ID with DOB required. Online bookings only. | ✅ verified | The homepage banner says 48%. A search snippet said 35%, so the official page was used. esselworld.in now redirects here. |
| The Face Shop (India) | https://thefaceshop.in/pages/loyalty-page | Loyalty members get +20 Glow Points to celebrate their birthday. | ✅ verified | Low value. Read with WebFetch only; the browser render didn't show the text (likely a lazy-loaded widget). |
| U.S. Polo Assn. | https://uspoloassn.in/pages/uspa-rewards | Birthday voucher: Silver 10%, Gold 15%, Platinum 20%. Valid from 15 days before to 15 days after the birthday. Enrolment needs a ₹5,000+ purchase. | ✅ verified | The channel isn't stated. |
| Plum | https://www.plumgoodness.com/pages/plum-rewards | The FAQ refers to PlumCash earned "during your birthday month", valid 3 months. The tier table (an image) wasn't readable. | ⚠️ unverified | The perk exists but its size is unknown. |
| Metro Shoes | https://www.metroshoes.com/loyalty-tc | ClubMetro members get offers on their birthday if they shared their DOB at enrolment. | ⚠️ unverified | No value stated. |
| Skechers | https://www.skechers.in/faq-detail/?fid=skechers-plus | Skechers Plus (free) lists a "Birthday Delight" benefit that can't be combined with other offers. | ⚠️ unverified | No value stated. In-store redemption is Mumbai only. |
| Kiehl's | https://www.kiehls.in/pages/rewards-terms-conditions | The T&C say Silver, Gold and Black members get "birthday gifts and discounts". | ⚠️ unverified | No details. A search snippet's "2 deluxe samples" claim couldn't be found on the official page. |
| Health & Glow | https://corporate.healthandglow.com/pages/hg-club | h&g Club advertises an exclusive birthday voucher. | ⚠️ unverified | No value or terms. |
| Myntra | https://blog.myntra.com/celebrating-fans-with-the-myntra-insider-programme/ | The official blog says Insider members get special offers on birthdays, depending on level. | ⚠️ unverified | The source is an old blog post. The current Insider terms weren't readable. |
| L'Occitane | https://in.loccitane.com/pages/vip-membership-program | Club and Gold members get a one-time voucher in store during the birthday month. Members must show their registered mobile or ID. | ⚠️ unverified | The voucher value isn't stated. |
| La Pino'z Pizza | https://lapinozpizza.in/wallet | The signup form says adding your DOB unlocks birthday & anniversary treats. | ⚠️ unverified | Vague, like the Theobroma entry. |
| Hidesign | https://hidesigncustomercare.zohodesk.in/portal/en/kb/articles/loyaltiy-prog | After registration, members get a unique birthday coupon in their birthday month. Give your DOB in store, or email it with ID for online. | ⚠️ unverified | The source is Hidesign's official help centre. No value stated. |
| Mia by Tanishq | https://www.miabytanishq.com/en_IN/offertnc.html | Birthday/anniversary coupon T&C: website and app only, birthday month only, and the DOB can't be changed. Not valid on items already discounted. | ⚠️ unverified | No value stated. This is separate from the existing Titan Encircle entry. |
| CaratLane | https://www.caratlane.com/treasure-chest-gold-scheme | The FAQ says birthday and anniversary coupons can be combined with Treasure Chest redemption. | ⚠️ unverified | This only confirms the coupon exists. A "5% off" claim appears only on coupon sites. |
| adidas | https://www.adidas.co.in/adiClub | adiClub Level 2 (1,000 to 3,999 points) and up get a Birthday Gift. | ⚠️ unverified | The gift isn't specified. |

### Update to an existing entry (not duplicated)

- **Barbeque Nation** (`barbeque-nation-in`): there is now an official source at https://www.barbequenation.com/smiles. Gold and Platinum Smiles members get **100 Smile Coins** (₹1 each) once a year for their birthday, and also for their anniversary. If both fall in the same month, only the birthday reward is credited. Coins are valid for 90 days. The existing entry could be upgraded to verified with this wording.

## Rejected

| Brand | Reason |
|---|---|
| Blue Tokai | The Blue Tokai Circle page has no birthday benefit. |
| Tira | The Treats loyalty page has no birthday benefit. |
| Bath & Body Works India | bathandbodyworks.in has no loyalty program. The US birthday reward doesn't apply. |
| Lakmé (products, Glam Squad) | Program discontinued on 31 Jan 2025 (official FAQ). The salon program is listed separately. |
| FabIndia | FabFamily FAQ and T&C collect your DOB but describe no birthday reward. |
| Biba, Spykar, Levi's India | Official loyalty or offer pages have no birthday benefit. |
| SUGAR Cosmetics | No birthday text found on the official site. Search snippets referred to sale banners. |
| Purplle Elite | The product page lists a "free birthday gift", but the membership is out of stock and seems discontinued. |
| Domino's India | The "birthday bash" is Domino's own brand anniversary promo (2022), not a perk for your birthday. Already rejected. |
| Taco Bell India | The rewards app page lists bells for joining and spending only. |
| PUMA India | "Birthday Bash" is PUMA's brand sale (Sept 2026), not a personal perk. |
| MGM Dizzee World | Official pages exist for month-specific birthday campaigns (Mar, Apr, Jul 2026: free entry with ID plus one paid ticket), but none is listed for the current month. Recheck monthly. |
| Lemon Tree Hotels | The homepage mentions "birthday or anniversary surprises", but the rewards page has no terms. Too vague. |
| Club Cinépolis, PVR INOX, Smaaash | No birthday benefit on official pages. |
| Geetanjali Salon, Mamagoto, Samsonite India | No birthday benefit on official pages. |
| Bobbi Brown, Estée Lauder, MAC (India) | Official pages redirected home or returned 403. The snippets found were US copy in $. |
| KFC India, Baskin Robbins India, Cream Stone, Third Wave (already listed) | Birthday claims appear only on deal sites and blogs. No official source. |
| House of Lakshita | The tier birthday benefit (10%/20%) appears only in a trade-press article. The official site doesn't describe it. |
| Not researched in depth / nothing found | Chai Point, Mad Over Donuts, Tim Hortons India, Dunkin India, Naturals, Enrich, VLCC, Kama Ayurveda, Mamaearth, Innisfree India, Max/Landmark, Reliance Trends, Pantaloons, AJIO, Kalyan, Malabar, Bluestone, Croma, Hamleys, Archies, Decathlon, Swiggy/Zomato, IndiGo, Air India, Taj/NeuPass. Searches turned up no official birthday terms. |

## Concerns

- Twelve entries are unverified because the official page confirms a birthday perk but not its value. Those offer texts say so explicitly.
- Amusement-park offers (Wonderla, Imagicaa, Wet'nJoy, Water Kingdom) are campaign-style and may change. Wonderla's is dated to 31 Mar 2027. The others have no end date.
- Channel is a best guess where the page is silent (Bata, Global Desi, AND, USPA, Swarovski).
- The Lakmé Salon regex contains "é", which is a letter, so it fits the allowed charset.
- `wikidata` is set only for Costa Coffee (Q608845), Marks & Spencer (Q714491) and adidas (Q3895).

## Claim details (follow-up)

Every entry now has `rewardItem`, `steps`, `purchaseRequired`, `validFor`, and, where the page states them, `minSpend`, `signupLeadDays` and `bring`. These are based only on the official pages cited above. "Not published by the brand, varies by member" marks unverified entries whose reward isn't stated. `barbeque-nation-in` is included as an updated entry: it is now verified, with the Smiles page as its source.
