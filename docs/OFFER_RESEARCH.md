# Offer Research: Birthday Side Quests

Last research pass: **2026-10-02**. Data file: `research/offers.draft.json` (25 entries: 16 verified, 9 unverified; 9 relevant to India).

## Method

1. Used web search only to *discover* candidate programs and official URLs. Third-party blogs, deal sites and news articles were **never** used as a source of offer details.
2. For each brand, fetched the brand's own page (loyalty page, T&Cs, help-centre article, or the brand's own newsroom) and paraphrased only what that page says. Some pages were read via the brand's own public help-centre API (Zendesk JSON on `help.timhortons.ca` and `customercare.bathandbodyworks.com`) or the brand's own JS bundle (Starbucks India), which contains the same text the page shows.
3. **✅ verified** = the offer and its main conditions are stated in text on an official brand domain.
   **⚠️ check with store** = an official page exists (or the program is widely reported) but the page is blocked to automated fetching, geo-restricted, rendered as an image or JS only, or too vague to confirm what the reward is. These entries use cautious wording and `verified: false`.
4. `claimWindow` is `varies` whenever the window depends on tier or the official text doesn't state it.
5. OSM `wikidata` IDs are included only for brands where I'm confident of the `brand:wikidata` value; otherwise only `nameRegex` is given.

## Findings

| Brand | Country | Official URL | What the official page says (paraphrase) | Verdict | Notes |
|---|---|---|---|---|---|
| Starbucks | US | https://www.starbucks.com/terms/rewards/ | Rewards members get 1 free handcrafted drink, food item or bottled drink. You must join 7+ days before your birthday, add your birthday and make 1 Star-earning purchase. Green tier: on the day only; Gold: 7 days; Reserve: 30 days. In-store only. | ✅ verified | Excludes alcohol, merch, multi-serve items. |
| Starbucks | CA | https://www.starbucks.ca/terms/rewards/ | Same terms as the US. | ✅ verified | |
| Starbucks | GB | https://www.starbucks.co.uk/rewards | Free birthday drink for **Gold** members (2,500 Stars). | ✅ verified | Gold only. The page doesn't state a redemption window. |
| Tata Starbucks | IN | https://www.starbucks.in/rewards | The site's own code shows the text "provide your birthday details to receive your birthday reward". It doesn't say what the reward is. | ⚠️ check with store | Site is JS-only (Angular), and WebFetch failed on its TLS certificate. The reward exists, but its contents and tiers aren't confirmed. |
| Sephora | US, CA | https://newsroom.sephora.com/sephora-unwraps-another-year-of-beauty-with-its-2026-beauty-insider-birthday-gift-offerings/ | All Beauty Insider tiers pick a 2026 birthday gift. VIB/Rouge also get rotating online-exclusive gifts. You can take 250 points instead (in store). Free in store; online needs a $25 minimum purchase. | ✅ verified | Source is Sephora's own newsroom (sephora.com subdomain). sephora.com itself returned 403. The release doesn't state the redemption window. |
| Ulta Beauty | US | https://www.ulta.com/rewards/terms-and-conditions | 2x points in your birthday month, plus a free birthday gift once a year while supplies last. You need a valid email/app and your birthday in your profile. No purchase needed in store; online/pickup needs a >$0 purchase. | ✅ verified | Platinum/Diamond get an extra birthday perk. |
| Bath & Body Works | US | https://customercare.bathandbodyworks.com/hc/en-us/articles/4410658819347 | Birthday Reward: 1 free item with original price up to $9.95, valid 30 days. Show the barcode in US stores or apply the code online. | ✅ verified | Read through the brand's Zendesk help-centre API, because the HTML returned 403. |
| Krispy Kreme | US | https://www.krispykreme.com/rewards | FAQ: Rewards members get a birthday reward on the birthday in their account, valid 30 days. | ✅ verified | The FAQ doesn't name the item. The offer text is kept generic. |
| Krispy Kreme | GB | https://www.krispykreme.co.uk/rewards | Rewards members get a free Original Glazed doughnut on their birthday. | ✅ verified | No window stated. |
| Tim Hortons | CA | https://help.timhortons.ca/hc/en-ca/articles/33452510390427 | Free-treat birthday offer. Add your DOB 7+ days before and scan Tims Rewards at least once in the last 12 months. The offer appears 2 days before your birthday and must be used by 8am the day after. | ✅ verified | Read through the Zendesk API (HTML returned 403). Help articles were updated Sept 2026. |
| IHOP | US | https://www.ihop.com/en/about-ihop/faqs/rewards | Rewards members automatically get 5 PanCoins on the first day of their birthday month. | ✅ verified | www returned 403. I read the same FAQ on IHOP's `cm4.ihop.com` host. It does **not** promise a specific free item; PanCoins are redeemed in the Stack Market. |
| The Body Shop | GB | https://www.thebodyshop.com/pages/lybc/love-your-body-club | Love Your Body Club members get a £5 voucher on their birthday. Use your account email in store or log in online. | ✅ verified | |
| The Body Shop | IN | https://www.thebodyshop.in/loyalty-club | Birthday offer by tier. Friend (free): 5% off or a free product. Club: 10% off or a free product. Platinum: 20% off. | ✅ verified | The page doesn't state a window. |
| Nando's | AU | https://www.nandos.com.au/peri-perks-terms-and-conditions | $15 voucher emailed on the 1st of your birthday month, valid 30 days. Requires a verified account, DOB on file, and a purchase in the prior 6 months. Show photo ID. | ✅ verified | No voucher if you join during your birthday month. |
| Nykaa | IN | https://www.nykaa.com/app-nykaa-prive-help | Birthday-month points multiplier: 1.5x for Member, 2x for Gold, 3x for Platinum. Gold and Platinum also get a free gift if they buy in their birthday month. You need an email and birthday in your profile. | ✅ verified | The base tier gets no gift, only the multiplier. Nykaa may change the gift at any time. |
| Westside | IN | https://www.westside.com/pages/membership | Paid WestStyleClub (Rs.199): birthday voucher for 10% off on Rs.12,000+ or 20% off on Rs.15,000+. Valid in your birthday month, in store, in the app or online. | ✅ verified | Not a freebie: it needs paid membership and a high minimum spend. You may want to filter it out of the app. |
| Tanishq / Titan (Encircle) | IN | https://www.titaneyeplus.com/titan-encircle | Encircle members get birthday/anniversary offers at Titan-group stores (Tanishq, Mia, Zoya, World of Titan, Fastrack, Helios, Skinn, Taneira). Active 15 days before to 15 days after; one redemption per brand. | ✅ verified | The page doesn't say what the offer is worth. titan.co.in and tanishq.co.in returned 403, so I read the same Encircle FAQ on Titan Eye+ (a Titan-owned domain). |
| Third Wave Coffee | IN | https://www.thirdwavecoffeeroasters.com/ | The official site has no birthday text. The reward seems to live in the app only. | ⚠️ check with store | The only hint came from a forum (free drink in birthday month, min ₹500 annual spend). It can't be confirmed officially, so the details are omitted. |
| Shoppers Stop | IN | https://www.shoppersstop.com/fc-birthday | A dedicated First Citizen "Birthday" landing page exists, but its content is image banners (gift-voucher promo) with no readable terms. | ⚠️ check with store | No T&C text found. |
| Barbeque Nation | IN | https://www.barbequenation.com/ | The site offers "Birthday" as a celebration type when booking. It mentions no complimentary item. | ⚠️ check with store | A free cake / "birthday person eats free" is reported only by third parties and coupon sites. Not confirmed. |
| Theobroma | IN | https://theobroma.in/ | The signup form says adding your DOB "unlocks birthday & anniversary treats". It gives no details. | ⚠️ check with store | Vague; no T&C found. |
| Denny's | US | https://www.dennys.com/rewards | Not readable: 403 for automated fetches. | ⚠️ check with store | Widely reported as a free Grand Slam for Rewards members. Not confirmed, so the wording is generic. |
| Panera Bread | US | https://www.panerabread.com/en-us/mypanera.html | Not readable: 403/404. | ⚠️ check with store | Reported as a free birthday treat for MyPanera members. Not confirmed. |
| Costa Coffee | GB | https://www.costa.co.uk/costa-club | Not readable: the request timed out. | ⚠️ check with store | Search snippets of costa.co.uk mention a birthday cake reward (opt in to marketing, add your birthday in the app). I couldn't open the page to confirm. |
| Baskin-Robbins | US | https://www.baskinrobbins.com/ | Not readable: 403. | ⚠️ check with store | Reported birthday coupon/club. Not confirmed; I used the homepage because the rewards page path is unconfirmed. |

## Rejected

| Brand | Country | Reason |
|---|---|---|
| Chaayos | IN | No birthday offer found on chaayos.com or in any official source. The only Chaayos offers found were bank and coupon promos. |
| Baskin Robbins India | IN | Nothing about birthdays on baskinrobbinsindia.com. The US Birthday Club can't be assumed to apply in India. |
| Dunkin' | US | Official site is geo-blocked (Cloudflare). Third parties report that the birthday free drink was **replaced by 3x points**. That can't be confirmed, and it's not a freebie anymore. |
| H&M | global | hm.com returned 403 or timed out. Reports say the birthday discount was **discontinued in several markets in 2025**. Dropped rather than risk listing a dead offer. |
| Häagen-Dazs | global | No customer birthday program found, only a brand "Free Cone/Flavor Day". |
| Pret | GB | No birthday perk found on pret.co.uk (Club Pret is a paid subscription). |
| Nando's | GB | nandos.co.uk returned 403. No official confirmation of a UK birthday reward was found (only third-party claims). The AU program is listed instead. |
| Sephora | GB / IN | sephora.co.uk and sephora.in returned 403. No official text found. |
| Lifestyle (Landmark Rewards) | IN | The Landmark Rewards page loads but doesn't mention birthdays. |
| Pantaloons, Lenskart, Domino's India, Pizza Hut India, Café Coffee Day, Haldiram's, Mainland China | IN | No official birthday program found (no official pages, or pages with no birthday text). |

## Concerns / follow-ups

- Many US brand sites (Denny's, Panera, Dunkin', Baskin-Robbins, Sephora, H&M) block automated fetches. Someone with a normal browser in the right country should check them by hand before they're promoted to verified.
- Several "verified" entries confirm that a reward **exists** but not what it is: Krispy Kreme US, Tim Hortons, Titan Encircle and IHOP (points, not a free item). The offer text was kept generic on purpose.
- Westside and The Body Shop IN (higher tiers) are discounts with conditions, not freebies.
- The IHOP, Titan and Bath & Body Works sources were read on alternate official hosts or APIs; see the notes column.

## Round 2 (2026-10-02)
More brands were researched after users said there were too few results. The detailed notes are in [research/OFFER_RESEARCH_INDIA.md](../research/OFFER_RESEARCH_INDIA.md) and [research/OFFER_RESEARCH_GLOBAL.md](../research/OFFER_RESEARCH_GLOBAL.md).

- **Totals:** `offers.json` now has 102 offers (82 verified) across 11 countries, 37 of them for India.
- **Updated:** Panera, Costa UK and Barbeque Nation are now verified.
- **Removed:** Denny's, because its official rewards pages describe points only and no birthday reward.
- **Spot-checks** by the Orchestrator against the official pages: Chili's (free dessert, expires 10 days after issue) and Wonderla (birthday Buy 1 Get 1 ticket) both matched.
- **New claim fields:** new entries carry `rewardItem`, `steps`, `purchaseRequired`, `minSpend`, `signupLeadDays`, `validFor` and `bring`.
