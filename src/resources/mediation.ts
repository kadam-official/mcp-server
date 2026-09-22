export const MEDIATION_CONTENT = `
Kadam Smart Mediation — the publisher's monetization through outside ad networks.
The same thing goes by: "mediation" (the API, the code and the report dimensions),
"Медиация" in the Russian cabinet, and "external monetization" in anything written
before the section was renamed.

What it is:
A publisher can sell an ad unit's traffic through outside ad networks alongside Kadam's
own demand. Kadam predicts what each network pays and gives the impression to whoever is
worth more, so the publisher runs one ad unit, not several.

Vocabulary:
- Network  — the outside ad network (Monetag, ExoClick, TrafficStars, TwinRed, ...).
             Network id 0 is Kadam itself, so reports show "Kadam" as one of the networks.
- Account  — the publisher's own account at that network, stored as an API key. One
             account per network serves every ad unit. The API returns only a mask of the
             key, never the key: never ask the publisher to read an existing key back.
             They may dictate a new one to rotate it.
- Placement (zone) — the ad slot on the network's side. A placement belongs to one
             network account and may be used by one connection across all of Kadam.
- Connection — a placement attached to one ad unit. This is what carries geo, unique cap,
             proxy policy, the tag template and the test share.

Test share:
0 means off. 1-50% forces that share of impressions to the network past the auction, so
the predictor can measure what it really pays. States: off, running, finished. Restarting
the test (retest) starts a new measurement epoch; editing geo or the cap does not.

Money:
Networks on the DIRECT payout model pay the publisher themselves, so their revenue is NOT
part of the Kadam balance. In reports it is a separate measure:
- kadam_revenue    — what Kadam paid (finance_moneyInKadam)
- mediation_revenue — what the networks paid (finance_moneyInMediation)
- revenue          — the two together (finance_moneyIn)
Group by "network" to compare them, or by "ad_unit" to see where the money is made.

Formats: only popunder, banner and video ad units can take mediation.

Access: the section is enabled per publisher account. When it is off, every call answers
403 with "Kadam Smart Mediation is not enabled for this account" — that is a feature flag,
not a bad API key.
`;
