/**
 * Kadam internal GEO ID mapping (ISO 3166-1 alpha-2 → geoID).
 * Source: db_tpartner.geo table.
 */
export const ISO_TO_GEO_ID: Record<string, number> = {
  AD: 89, AE: 120, AF: 182, AG: 278, AI: 198, AL: 88, AM: 18, AN: 299,
  AO: 180, AR: 39, AS: 276, AT: 21, AU: 48, AW: 279, AZ: 17, BA: 90,
  BB: 200, BD: 132, BE: 22, BF: 244, BG: 87, BH: 115, BI: 245, BJ: 242,
  BL: 301, BM: 202, BN: 215, BO: 152, BR: 40, BS: 199, BT: 214, BW: 243,
  BY: 9, BZ: 201, CA: 35, CC: 294, CD: 250, CF: 247, CG: 189, CH: 32,
  CI: 191, CK: 225, CL: 144, CM: 173, CN: 43, CO: 133, CR: 162, CU: 203,
  CV: 246, CW: 283, CX: 293, CY: 97, CZ: 114, DE: 24, DJ: 251, DK: 94,
  DM: 204, DO: 148, DZ: 137, EC: 143, EE: 77, EG: 131, EH: 274, ER: 253,
  ES: 28, ET: 176, FI: 111, FJ: 226, FK: 295, FM: 231, FO: 284, FR: 29,
  GA: 254, GB: 23, GD: 206, GE: 25, GG: 196, GH: 165, GI: 195, GL: 205,
  GM: 255, GN: 256, GQ: 252, GR: 93, GT: 150, GU: 228, GW: 257, GY: 212,
  HK: 155, HN: 154, HR: 112, HT: 207, HU: 92, ID: 129, IE: 95, IL: 85,
  IM: 296, IN: 44, IO: 280, IQ: 136, IR: 135, IS: 96, IT: 27, JE: 197,
  JM: 163, JO: 149, JP: 45, KE: 169, KG: 81, KH: 153, KI: 229, KM: 249,
  KN: 208, KP: 222, KR: 140, KW: 116, KY: 282, KZ: 16, LA: 217, LB: 151,
  LC: 209, LI: 98, LK: 224, LR: 259, LS: 258, LT: 75, LU: 99, LV: 76,
  LY: 159, MA: 139, MC: 103, MD: 19, ME: 113, MF: 303, MG: 260, MH: 230,
  MK: 100, ML: 262, MM: 220, MN: 166, MO: 218, MP: 235, MR: 263, MS: 298,
  MT: 101, MU: 179, MV: 219, MW: 261, MX: 36, MY: 123, MZ: 174, NA: 264,
  NC: 233, NE: 265, NG: 145, NI: 161, NL: 26, NO: 104, NP: 221, NR: 232,
  NU: 234, NZ: 193, OM: 117, PA: 168, PE: 138, PF: 227, PG: 237, PH: 194,
  PK: 223, PL: 79, PM: 304, PN: 300, PR: 178, PS: 158, PT: 30, PW: 236,
  PY: 167, QA: 118, RE: 286, RO: 105, RS: 107, RU: 1, RW: 266, SA: 119,
  SB: 288, SC: 268, SD: 171, SE: 31, SG: 122, SH: 302, SI: 109, SJ: 289,
  SK: 108, SL: 269, SM: 106, SN: 190, SO: 270, SR: 213, SS: 271, ST: 267,
  SV: 156, SX: 287, SY: 157, SZ: 272, TC: 291, TD: 248, TG: 273, TH: 128,
  TJ: 187, TK: 290, TL: 216, TM: 20, TN: 146, TO: 239, TR: 110, TT: 170,
  TV: 240, TW: 142, TZ: 164, UA: 3, UG: 188, US: 34, UY: 160, UZ: 83,
  VA: 91, VC: 210, VE: 141, VG: 281, VI: 211, VN: 134, VU: 241, WF: 292,
  WS: 238, XK: 297, YE: 175, YT: 285, ZA: 124, ZM: 275, ZW: 181,
};

export function resolveCountryIds(isoCodes: string): number[] {
  return isoCodes
    .split(",")
    .map(s => s.trim().toUpperCase())
    .filter(Boolean)
    .map(code => {
      const id = ISO_TO_GEO_ID[code];
      if (id === undefined) throw new Error(`Unknown country code: ${code}`);
      return id;
    });
}
