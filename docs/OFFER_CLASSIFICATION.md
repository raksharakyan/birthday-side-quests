# Offer classification: rewardType and needsPastSpend

Generated for DECISIONS #27 on 2026-10-02. Every entry in `public/offers.json` has two required fields that set the list order and the type chip on each card:

- `rewardType`: `"free"` (a free item, gift, treat or entry with nothing to buy beyond joining a free programme) or `"discount"` (percentage or money off, a cash-value voucher, buy one get one, bonus points or coins, or a free item that needs a purchase at the time).
- `needsPastSpend`: `true` when you only qualify after spending before: a tier reached by spend or points, a purchase or visit in a past window, a paid membership, or a minimum yearly spend. `false` when anyone can join for free and get it (even if they must join some days before).

Rules used: classified only from what each entry states (`offer`, `rewardItem`, `howToClaim`, `steps`, `purchaseRequired`, `minSpend`) and the research notes. When the wording was unclear, the conservative choice was taken (discount over free; needsPastSpend true when any tier, spend or past-transaction rule is stated). Where an offer differs by tier, the entry tier you get on joining decides.

## Counts

| Tier | Meaning | Offers |
|---|---|---|
| 0 | Free, no past spend | 25 |
| 1 | Discount, no past spend | 43 |
| 2 | Needs past spend (free or discount) | 34 |
| | Total | 102 |

## Table

| id | brand | rewardType | needsPastSpend | reason (deciding field) |
|---|---|---|---|---|
| `starbucks-ae` | Starbucks | free | true | howToClaim: "Reach Gold (750 Stars)"; offer: "Free handcrafted drink" |
| `boost-juice-au` | Boost Juice | discount | false | offer: "Birthday drink ... (check the app for details)" does not say free; join only |
| `donut-king-au` | Donut King | free | false | offer: "Free regular-size drink"; howToClaim: register only |
| `gelatissimo-au` | Gelatissimo | free | true | howToClaim: "make a purchase over $1 in the prior 12 months" |
| `gloria-jeans-au` | Gloria Jean's | free | false | offer: "Free small ... beverage"; join and add birthday |
| `grilld-au` | Grill'd | discount | false | offer: "Free snack chips with a burger or salad"; purchaseRequired: true |
| `lindt-au` | Lindt | discount | false | offer: "Birthday surprise voucher" (no free item stated); join free |
| `max-brenner-au` | Max Brenner | free | true | howToClaim: "make a purchase within 6 months before your birthday month" |
| `mecca-au` | MECCA | discount | true | minSpend: "$300+ a year to reach Beauty Loop"; offer: "Birthday surprise" (not stated as free) |
| `michels-au` | Michel's Patisserie | free | false | offer: "Free regular hot beverage"; register only |
| `muffin-break-au` | Muffin Break | free | true | offer: "Birthday treat"; howToClaim: "buy in the year before" |
| `nandos-au` | Nando's | discount | true | offer: "$15 Nando's voucher"; howToClaim: "purchase in the 6 months before birthday month" |
| `san-churro-au` | San Churro | free | true | howToClaim: "with a full-price purchase in the prior 11 months" |
| `booster-juice-ca` | Booster Juice | free | true | howToClaim: "1 purchase in the past year" |
| `boston-pizza-ca` | Boston Pizza | free | false | offer: "Free dine-in dessert"; join MyBP only |
| `indigo-ca` | Indigo | discount | false | offer: "20% off one purchase"; "Join plum rewards for free" |
| `second-cup-ca` | Second Cup | discount | false | offer: "Birthday bonus ... (details not stated)"; join only |
| `starbucks-ca` | Starbucks | free | true | howToClaim: "make 1 Star-earning purchase first" |
| `tim-hortons-ca` | Tim Hortons | free | true | offer: "Free treat offer"; howToClaim: "scan Tims Rewards once in last 12 months" |
| `sephora-fr` | Sephora | free | true | howToClaim: "Reach Black status (150 points or 4 store visits)"; offer: "Birthday gift" |
| `costa-gb` | Costa Coffee | free | false | offer: "Free cake"; howToClaim: join Costa Club and add birthday (no past-transaction rule stated) |
| `greggs-gb` | Greggs | free | false | offer: "Free sweet treat"; create account and add birthday |
| `krispy-kreme-gb` | Krispy Kreme | free | false | offer: "Free Original Glazed doughnut"; sign up only |
| `pizza-express-gb` | PizzaExpress | discount | false | minSpend: "£15"; purchaseRequired: true; "Bronze tier and up" (entry tier) |
| `prezzo-gb` | Prezzo | free | true | offer: "after their first visit"; howToClaim: "dine once before your birthday" |
| `space-nk-gb` | Space NK | free | false | offer: "Birthday gift"; join N.DULGE Rewards only |
| `starbucks-gb` | Starbucks | free | true | howToClaim: "Be a Gold-level ... member (2,500 Stars)" |
| `tgi-fridays-gb` | TGI Fridays | free | false | offer: "Free dessert"; join Stripes Rewards only |
| `the-body-shop-gb` | The Body Shop | discount | false | offer: "£5 voucher"; "Join Love Your Body Club free" |
| `wagamama-gb` | wagamama | free | false | offer: "Birthday gift added to your soul club wallet"; join only |
| `zizzi-gb` | Zizzi | discount | false | offer: "Birthday Perk" (not stated as free); join only |
| `insomnia-ie` | Insomnia Coffee | free | true | howToClaim: "make a purchase in the previous 12 months" |
| `starbucks-ie` | Starbucks | free | true | howToClaim: "Reach Gold level" |
| `adidas-in` | adidas | free | true | offer: "adiClub Level 2+ members (1,000+ points) get a birthday gift" |
| `and-in` | AND | discount | true | offer: "10% off (Insider) or 20% off (Trendsetter)"; howToClaim: "Reach Insider or Trendsetter tier" |
| `barbeque-nation-in` | Barbeque Nation | discount | true | rewardItem: "100 Smile Coins"; howToClaim: "Reach Gold or Platinum" |
| `bata-in` | Bata | discount | false | rewardItem: "Gift voucher worth up to ₹750" (cash value); join Bata Club |
| `caratlane-in` | CaratLane | discount | false | offer: "birthday and anniversary coupons"; add birthday to profile |
| `costa-coffee-in` | Costa Coffee | free | true | howToClaim: "at least one transaction in the past 12 months" |
| `forest-essentials-in` | Forest Essentials | discount | true | offer: "10 to 15% off"; howToClaim: "unlocks after ₹5,000 total spend" |
| `global-desi-in` | Global Desi | discount | true | offer: "10% off (Insider) or 20% off (Trendsetter)"; howToClaim: "Reach Insider or Trendsetter tier" |
| `health-and-glow-in` | Health & Glow | discount | false | offer: "birthday voucher; value not published"; join h&g Club |
| `hidesign-in` | Hidesign | discount | false | offer: "unique birthday coupon"; register only |
| `imagicaa-in` | Imagicaa | discount | false | offer: free Express ticket "when at least 4 friends or family pre-book regular tickets"; purchaseRequired: true |
| `club-itc-in` | ITC Hotels (Club ITC) | discount | true | offer: "Gold and higher members earn double Green Points" |
| `kiehls-in` | Kiehl's | discount | true | offer: "Silver, Gold and Black members get birthday gifts and discounts" |
| `loccitane-in` | L'Occitane | discount | true | offer: "Club and Gold members get a one-time birthday voucher"; research: Club and Gold are tiers |
| `la-pinoz-in` | La Pino'z Pizza | discount | false | offer: "unlocks birthday and anniversary treats; details not published" (unverified, not stated as free); join and add DOB |
| `lakme-salon-in` | Lakmé Salon | discount | true | offer: "15% off salon services"; howToClaim: "(₹1,000+ spend in 12 months)" |
| `marks-and-spencer-in` | Marks & Spencer | discount | false | offer: "10% (Club) ..."; "Join M&S Sparks" (Club is the base tier) |
| `metro-shoes-in` | Metro Shoes | discount | false | offer: "birthday offer; details not published"; join ClubMetro |
| `mia-by-tanishq-in` | Mia by Tanishq | discount | false | offer: "Birthday coupon"; purchaseRequired: true; register only |
| `myntra-insider-in` | Myntra | discount | true | howToClaim: "Shop enough on Myntra to join Insider" |
| `nykaa-in` | Nykaa | discount | false | offer: "1.5x to 3x reward points ... for all Privé tiers"; howToClaim: purchase in your birthday month |
| `plum-in` | Plum | discount | true | howToClaim: "Join Plum+ with any purchase"; reward is PlumCash |
| `shoppers-stop-in` | Shoppers Stop | discount | false | offer: "Birthday offer ... details not published"; member with birthday on file |
| `skechers-in` | Skechers | discount | false | offer: "'Birthday Delight' offer ... value not published"; "Join Skechers Plus free" |
| `swarovski-in` | Swarovski | discount | false | offer: "20% off birthday coupon, starting from the free Bronze tier" |
| `titan-encircle-in` | Tanishq / Titan (Encircle) | discount | false | offer: "Birthday offer for Encircle members"; no tier or spend stated |
| `starbucks-in` | Tata Starbucks | discount | false | offer: "Birthday reward ... details shown in app"; join and add birthday |
| `the-body-shop-in` | The Body Shop | discount | false | offer: "5% off or free product (Friend)"; "free Friend tier" |
| `the-face-shop-in` | The Face Shop | discount | false | rewardItem: "20 bonus Glow Points"; join only |
| `theobroma-in` | Theobroma | discount | false | offer: "Birthday treat for registered customers, details not published" (unverified, not stated as free); add DOB |
| `third-wave-coffee-in` | Third Wave Coffee | discount | false | offer: "Birthday reward reported ..."; "eligibility conditions may apply" (none stated) |
| `timezone-in` | Timezone | discount | true | offer: "200 tickets (Blue Elite) ..."; research: "Welcome-card tier gets no birthday treat" |
| `us-polo-assn-in` | U.S. Polo Assn. | discount | true | offer: "10% (Silver) ..."; howToClaim: "Enrol in USPA Rewards with a ₹5,000+ purchase" |
| `water-kingdom-in` | Water Kingdom | discount | false | offer: free entry "plus 48% off for 3 to 4 companions"; minSpend: "3 companion tickets" |
| `westside-in` | Westside | discount | true | offer: "10% off ... for paid WestStyleClub members"; howToClaim: "Buy WestStyleClub membership (Rs.199)" |
| `wetnjoy-lonavala-in` | Wet'nJoy Lonavala | discount | false | offer: free entry with "4 to 10 companions"; minSpend: "4 companion tickets" |
| `wonderla-in` | Wonderla | discount | false | offer: "Buy 1 Get 1 free park ticket"; purchaseRequired: true |
| `tealive-my` | Tealive | discount | false | offer: "Complimentary voucher" (item not stated); register before your birthday month |
| `burgerfuel-nz` | BurgerFuel | discount | false | offer: "Birthday reward for VIB Club members" (not stated as free); join 24h before |
| `nandos-nz` | Nando's | discount | true | rewardItem: "NZ$15 voucher"; howToClaim: "buy within 6 months before your birthday month" |
| `starbucks-nz` | Starbucks | discount | false | rewardItem: "Green: free drink size upgrade" (base tier, needs a drink purchase) |
| `tank-nz` | TANK | free | false | offer: "Free Full Classic Smoothie"; register only |
| `starbucks-sg` | Starbucks | discount | false | offer: "Birthday treats and bonus Stars" (bonus Stars are points; no item stated); join and add birthday |
| `swensens-sg` | Swensen's | free | false | offer: "Free Firehouse Happy Birthday Sundae"; join Cool Rewards only |
| `baskin-robbins-us` | Baskin-Robbins | discount | false | offer: "Birthday coupon"; create account only |
| `bath-and-body-works-us` | Bath & Body Works | free | false | offer: "One free item (original price up to $9.95)"; add birthday to profile |
| `chilis-us` | Chili's | free | false | offer: "Free birthday dessert"; join only |
| `clinique-us` | Clinique | discount | false | offer: "Birthday gift ... with a $55 purchase"; minSpend: "$55" |
| `corner-bakery-us` | Corner Bakery | free | false | offer: "Free treat ... (all tiers)" |
| `crumbl-us` | Crumbl | free | true | howToClaim: "Reach Silver status (500 Crumbs earned this year)" |
| `dairy-queen-us` | Dairy Queen | discount | false | offer: "Birthday surprise in the DQ app" (not stated as free) |
| `dsw-us` | DSW | discount | false | offer: "Birthday bonus reward for all DSW VIP members"; "Join DSW VIP for free" |
| `duck-donuts-us` | Duck Donuts | free | true | howToClaim: "rewards account active within the past 365 days" |
| `dutch-bros-us` | Dutch Bros | free | false | offer: "Free birthday drink"; join only |
| `ihop-us` | IHOP | discount | false | offer: "5 bonus PanCoins"; join only |
| `krispy-kreme-us` | Krispy Kreme | discount | false | offer: "Birthday reward ..." (not stated as free); join only |
| `noodles-us` | Noodles & Company | free | false | rewardItem: "Classic: free dessert" (base tier); join only |
| `nothing-bundt-cakes-us` | Nothing Bundt Cakes | free | false | offer: "Free Bundtlet"; join only |
| `pf-changs-us` | P.F. Chang's | free | false | offer: "Free appetizer or dessert"; add birthday to profile |
| `panera-us` | Panera Bread | free | false | offer: "Free bakery treat"; "Join MyPanera for free" |
| `peets-us` | Peet's Coffee | free | false | offer: "Free birthday drink"; join only |
| `ritas-us` | Rita's Italian Ice | discount | false | offer: "Birthday (or half-birthday) reward" (not stated as free); join only |
| `sephora-us-ca` | Sephora | free | false | offer: "Free birthday gift"; howToClaim: "redeem free in store" ($25 minimum online only) |
| `smoothie-king-us` | Smoothie King | discount | false | offer: "$2 20 oz for Healthy Rewards members" (base tier) |
| `starbucks-us` | Starbucks | free | true | howToClaim: "make 1 Star-earning purchase first" |
| `target-us` | Target | free | false | offer: "A birthday gift"; "Join Target Circle for free" |
| `cheesecake-factory-us` | The Cheesecake Factory | discount | false | offer: "Free slice ... when you make a purchase"; purchaseRequired: true |
| `tropical-smoothie-cafe-us` | Tropical Smoothie Cafe | free | false | offer: "Free smoothie reward"; join only |
| `ulta-us` | Ulta Beauty | free | false | offer: "Free birthday gift"; howToClaim: "no purchase needed in store" |

## Judgement calls

- `boost-juice-au` (Boost Juice): Unverified "Birthday drink" never says free, so discount (conservative).
- `lindt-au` (Lindt): "Surprise voucher" with no stated item, so discount (conservative).
- `mecca-au` (MECCA): "Birthday surprise" is not stated as a free gift, so discount; tier 2 either way.
- `second-cup-ca` (Second Cup): Unverified "birthday bonus" with no details, so discount (conservative).
- `starbucks-ca` (Starbucks): A prior Star-earning purchase is required (same terms as US), so needsPastSpend true.
- `costa-gb` (Costa Coffee): Brief expected true, but no prior-transaction rule is stated for GB (that rule is in costa-coffee-in), so false.
- `pizza-express-gb` (PizzaExpress): Bronze read as the entry tier you get on joining; reward needs a £15 spend at the time, so discount.
- `zizzi-gb` (Zizzi): "Birthday Perk" is not stated as free, so discount (conservative).
- `kiehls-in` (Kiehl's): Mixed "gifts and discounts" with no detail, so discount; Silver+ tier so needsPastSpend true.
- `loccitane-in` (L'Occitane): Voucher value not stated (discount); Club/Gold read as earned tiers (conservative).
- `la-pinoz-in` (La Pino'z Pizza): Unverified "treats" with details not published, so discount (conservative; changed from free after QA review, QA-PR5-01).
- `nykaa-in` (Nykaa): Base tier gets only a points multiplier on a birthday-month purchase (discount, no past spend); the free gift needs Privé Gold/Platinum.
- `shoppers-stop-in` (Shoppers Stop): First Citizen Club entry terms are not stated, so no past-spend rule recorded.
- `starbucks-in` (Tata Starbucks): Unverified "birthday reward" is not stated as free, so discount (conservative).
- `the-body-shop-in` (The Body Shop): Base tier is "5% off or free product", mixed, so discount (conservative).
- `theobroma-in` (Theobroma): Unverified "treat" with details not published, so discount (conservative; changed from free after QA review, QA-PR5-01).
- `third-wave-coffee-in` (Third Wave Coffee): Unverified "reward" not stated as free; unstated "conditions may apply" not treated as past spend.
- `tealive-my` (Tealive): "Complimentary voucher" does not say what it is for, so discount (conservative).
- `burgerfuel-nz` (BurgerFuel): "Birthday reward" is not stated as free, so discount (conservative).
- `starbucks-nz` (Starbucks): Base Green tier gets a size upgrade on a paid drink (discount); the free drink is Gold only.
- `starbucks-sg` (Starbucks): "Treats and bonus Stars" names no free item and bonus Stars are points, so discount (conservative; changed from free after QA review, QA-PR5-01).
- `dairy-queen-us` (Dairy Queen): "Birthday surprise" is not stated as free, so discount (conservative).
- `duck-donuts-us` (Duck Donuts): "Active in the past 365 days" read as a past transaction (conservative).
- `krispy-kreme-us` (Krispy Kreme): "Birthday reward" is not stated as free, so discount (conservative).
- `ritas-us` (Rita's Italian Ice): "Reward" is not stated as free, so discount (conservative).
- `sephora-us-ca` (Sephora): Free in store; online needs a $25 purchase. Classed by the in-store route.
- `starbucks-us` (Starbucks): Brief expected false, but the entry requires a prior Star-earning purchase ("any spend in the past"), so true.

## Revision 2026-10-02 (QA review, PR #5)

QA-PR5-01: an unpublished or unverified "treat" is as unclear as "surprise" or "reward", so the conservative rule applies. `la-pinoz-in`, `theobroma-in` and `starbucks-sg` moved from free to discount (tier 0 to tier 1). Counts went from 28 / 40 / 34 to 25 / 43 / 34. India now has no tier 0 offer; `costa-coffee-in` is its only free reward, and it needs past spend.

## Changing a classification

Edit the two fields in `public/offers.json` and the row above together. Quote the field that decided it. If a brand's terms change (for example a tier is added), re-check both fields.
