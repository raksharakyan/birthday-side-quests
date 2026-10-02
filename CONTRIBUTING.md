# Contributing 🎀

Thanks for helping more people find their birthday treats! The most valuable contribution is a **verified offer**.

## Submitting a verified offer
1. **Official source only.** The `sourceUrl` must be an `https://` page on the brand's own domain (rewards page, T&C or FAQ) that states the birthday offer. Blogs, coupon sites, Reddit, social posts and AI chatbots are **not** sources.
2. **Paraphrase.** Write `offer` (≤ 140 characters) and `howToClaim` (≤ 200) in your own words. Don't copy marketing text.
3. **Be honest about certainty.** Set `"verified": true` only if the official page clearly states the offer. If you can only see it in the app, or the page is vague, set `"verified": false`. The app will then show "Check with store".
4. **Date it.** Set `lastVerified` to the day you checked (YYYY-MM-DD).
5. **Reward type and past spend (required).** These set the list order (free first, then discounts, then offers that need past spend) and the chip on the card. Classify only from what the official page says:
   - `rewardType`: `"free"` when you get a free item, gift, treat or entry with nothing to buy beyond joining a free programme. `"discount"` for percent or money off, a cash-value voucher, buy one get one, bonus points or coins, or a free item that needs a purchase (for example a gift with a minimum spend, or free entry when friends buy tickets). A vague "birthday reward" or "surprise" is `"discount"`.
   - `needsPastSpend`: `true` when you only qualify after spending before: a tier reached by spend or points (Gold, Silver, Level 2), a purchase or visit in a past window (e.g. "a purchase in the last 12 months"), a paid membership or a minimum yearly spend. `false` when anyone can join for free and get it, even if they must join some days before.
   - If you're unsure, pick the conservative option (`"discount"`, `true`) and add a row to [docs/OFFER_CLASSIFICATION.md](docs/OFFER_CLASSIFICATION.md) quoting the field that decided it.
6. **Countries.** Offers often differ by country, so add one entry per country program (e.g. `starbucks-us`, `starbucks-in`).
7. **Claim details (optional, but they make the card much clearer).** Only add what the official page says:
   - `rewardItem`: the concrete thing you get (≤ 140 characters), shown as "You get: …".
   - `steps`: 1 to 6 short steps in order (each ≤ 100). Shown as a numbered list instead of `howToClaim`.
   - `purchaseRequired`: `true`, `false`, or `null` if unclear. `minSpend` (≤ 60), e.g. `"₹500"`.
   - `signupLeadDays`: whole days you must join before your birthday (0 to 90; 0 means any time).
   - `validFor` (≤ 80), e.g. `"7 days from your birthday"`. `bring`: up to 5 items (each ≤ 40), e.g. `["App", "Photo ID"]`.
   - No em dashes in any text. Use commas, colons, periods or parentheses.
8. Run `npm test` locally. The schema test must pass (it rejects entries without `rewardType` or `needsPastSpend`).
9. Open a PR with the title `offer: <Brand> (<country>)`. In the description, say what the official page says in one sentence.

Updating an offer that changed or ended works the same way: update the entry and its `lastVerified`, or delete it and say why in the PR.

## Code contributions
- Run `npm ci`, `npm run build`, `npm test` and `npm run test:e2e` before opening a PR. CI runs these plus `npm audit` and Lighthouse.
- **Security rules (non-negotiable):**
  - Never use `innerHTML` or other HTML-string APIs with data. Use `el()` from `src/render/dom.ts`.
  - No localStorage, cookies or IndexedDB, no geolocation, no analytics, and no third-party runtime scripts or fonts. The only storage is the one validated `sessionStorage` record in `src/session.ts` (DECISIONS #18). Don't add fields to it without a privacy review.
  - New network origins need a CSP change in `csp.config.ts` and a security review.
- Keep runtime dependencies minimal. Pin GitHub Actions to full commit SHAs.
- Accessibility: keep WCAG AA contrast and keyboard support, and respect `prefers-reduced-motion`.

## Reporting bugs
Open an issue with steps to reproduce, your browser, and what you expected. Report security problems privately as described in [SECURITY.md](SECURITY.md).

By contributing you agree your contributions are licensed under the MIT License.
