import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";
import { RSVP_LIMITS } from "@/lib/event-config";
import type {
  AttendanceStatus,
  RsvpFieldErrors,
  RsvpSubmissionInput,
  RsvpUpdateInput,
} from "@/types/rsvp";

export const DEFAULT_PHONE_COUNTRY: CountryCode = "KE";

export interface CountryOption {
  code: CountryCode;
  name: string;
  callingCode: string;
  label: string;
}

const PRIORITY_COUNTRY_CODES: readonly CountryCode[] = [
  "KE",
  "UG",
  "TZ",
  "RW",
  "ET",
  "GB",
  "US",
  "CA",
  "ZA",
  "NG",
  "AU",
  "FR",
  "DE",
  "IN",
];

// Deterministic English region names so SSR (Node) and CSR (browsers)
// always produce identical <select> option labels and ordering without
// runtime Intl.DisplayNames / localeCompare ICU differences.
const REGION_NAMES_EN: Partial<Record<CountryCode, string>> = {
  AC: "Ascension Island",
  AD: "Andorra",
  AE: "United Arab Emirates",
  AF: "Afghanistan",
  AG: "Antigua & Barbuda",
  AI: "Anguilla",
  AL: "Albania",
  AM: "Armenia",
  AO: "Angola",
  AR: "Argentina",
  AS: "American Samoa",
  AT: "Austria",
  AU: "Australia",
  AW: "Aruba",
  AX: "Åland Islands",
  AZ: "Azerbaijan",
  BA: "Bosnia & Herzegovina",
  BB: "Barbados",
  BD: "Bangladesh",
  BE: "Belgium",
  BF: "Burkina Faso",
  BG: "Bulgaria",
  BH: "Bahrain",
  BI: "Burundi",
  BJ: "Benin",
  BL: "St. Barthélemy",
  BM: "Bermuda",
  BN: "Brunei",
  BO: "Bolivia",
  BQ: "Caribbean Netherlands",
  BR: "Brazil",
  BS: "Bahamas",
  BT: "Bhutan",
  BW: "Botswana",
  BY: "Belarus",
  BZ: "Belize",
  CA: "Canada",
  CC: "Cocos (Keeling) Islands",
  CD: "Congo - Kinshasa",
  CF: "Central African Republic",
  CG: "Congo - Brazzaville",
  CH: "Switzerland",
  CI: "Côte d’Ivoire",
  CK: "Cook Islands",
  CL: "Chile",
  CM: "Cameroon",
  CN: "China",
  CO: "Colombia",
  CR: "Costa Rica",
  CU: "Cuba",
  CV: "Cape Verde",
  CW: "Curaçao",
  CX: "Christmas Island",
  CY: "Cyprus",
  CZ: "Czechia",
  DE: "Germany",
  DJ: "Djibouti",
  DK: "Denmark",
  DM: "Dominica",
  DO: "Dominican Republic",
  DZ: "Algeria",
  EC: "Ecuador",
  EE: "Estonia",
  EG: "Egypt",
  EH: "Western Sahara",
  ER: "Eritrea",
  ES: "Spain",
  ET: "Ethiopia",
  FI: "Finland",
  FJ: "Fiji",
  FK: "Falkland Islands",
  FM: "Micronesia",
  FO: "Faroe Islands",
  FR: "France",
  GA: "Gabon",
  GB: "United Kingdom",
  GD: "Grenada",
  GE: "Georgia",
  GF: "French Guiana",
  GG: "Guernsey",
  GH: "Ghana",
  GI: "Gibraltar",
  GL: "Greenland",
  GM: "Gambia",
  GN: "Guinea",
  GP: "Guadeloupe",
  GQ: "Equatorial Guinea",
  GR: "Greece",
  GT: "Guatemala",
  GU: "Guam",
  GW: "Guinea-Bissau",
  GY: "Guyana",
  HK: "Hong Kong SAR China",
  HN: "Honduras",
  HR: "Croatia",
  HT: "Haiti",
  HU: "Hungary",
  ID: "Indonesia",
  IE: "Ireland",
  IL: "Israel",
  IM: "Isle of Man",
  IN: "India",
  IO: "British Indian Ocean Territory",
  IQ: "Iraq",
  IR: "Iran",
  IS: "Iceland",
  IT: "Italy",
  JE: "Jersey",
  JM: "Jamaica",
  JO: "Jordan",
  JP: "Japan",
  KE: "Kenya",
  KG: "Kyrgyzstan",
  KH: "Cambodia",
  KI: "Kiribati",
  KM: "Comoros",
  KN: "St. Kitts & Nevis",
  KP: "North Korea",
  KR: "South Korea",
  KW: "Kuwait",
  KY: "Cayman Islands",
  KZ: "Kazakhstan",
  LA: "Laos",
  LB: "Lebanon",
  LC: "St. Lucia",
  LI: "Liechtenstein",
  LK: "Sri Lanka",
  LR: "Liberia",
  LS: "Lesotho",
  LT: "Lithuania",
  LU: "Luxembourg",
  LV: "Latvia",
  LY: "Libya",
  MA: "Morocco",
  MC: "Monaco",
  MD: "Moldova",
  ME: "Montenegro",
  MF: "St. Martin",
  MG: "Madagascar",
  MH: "Marshall Islands",
  MK: "North Macedonia",
  ML: "Mali",
  MM: "Myanmar (Burma)",
  MN: "Mongolia",
  MO: "Macao SAR China",
  MP: "Northern Mariana Islands",
  MQ: "Martinique",
  MR: "Mauritania",
  MS: "Montserrat",
  MT: "Malta",
  MU: "Mauritius",
  MV: "Maldives",
  MW: "Malawi",
  MX: "Mexico",
  MY: "Malaysia",
  MZ: "Mozambique",
  NA: "Namibia",
  NC: "New Caledonia",
  NE: "Niger",
  NF: "Norfolk Island",
  NG: "Nigeria",
  NI: "Nicaragua",
  NL: "Netherlands",
  NO: "Norway",
  NP: "Nepal",
  NR: "Nauru",
  NU: "Niue",
  NZ: "New Zealand",
  OM: "Oman",
  PA: "Panama",
  PE: "Peru",
  PF: "French Polynesia",
  PG: "Papua New Guinea",
  PH: "Philippines",
  PK: "Pakistan",
  PL: "Poland",
  PM: "St. Pierre & Miquelon",
  PR: "Puerto Rico",
  PS: "Palestinian Territories",
  PT: "Portugal",
  PW: "Palau",
  PY: "Paraguay",
  QA: "Qatar",
  RE: "Réunion",
  RO: "Romania",
  RS: "Serbia",
  RU: "Russia",
  RW: "Rwanda",
  SA: "Saudi Arabia",
  SB: "Solomon Islands",
  SC: "Seychelles",
  SD: "Sudan",
  SE: "Sweden",
  SG: "Singapore",
  SH: "St. Helena",
  SI: "Slovenia",
  SJ: "Svalbard & Jan Mayen",
  SK: "Slovakia",
  SL: "Sierra Leone",
  SM: "San Marino",
  SN: "Senegal",
  SO: "Somalia",
  SR: "Suriname",
  SS: "South Sudan",
  ST: "São Tomé & Príncipe",
  SV: "El Salvador",
  SX: "Sint Maarten",
  SY: "Syria",
  SZ: "Eswatini",
  TA: "Tristan da Cunha",
  TC: "Turks & Caicos Islands",
  TD: "Chad",
  TG: "Togo",
  TH: "Thailand",
  TJ: "Tajikistan",
  TK: "Tokelau",
  TL: "Timor-Leste",
  TM: "Turkmenistan",
  TN: "Tunisia",
  TO: "Tonga",
  TR: "Türkiye",
  TT: "Trinidad & Tobago",
  TV: "Tuvalu",
  TW: "Taiwan",
  TZ: "Tanzania",
  UA: "Ukraine",
  UG: "Uganda",
  US: "United States",
  UY: "Uruguay",
  UZ: "Uzbekistan",
  VA: "Vatican City",
  VC: "St. Vincent & Grenadines",
  VE: "Venezuela",
  VG: "British Virgin Islands",
  VI: "U.S. Virgin Islands",
  VN: "Vietnam",
  VU: "Vanuatu",
  WF: "Wallis & Futuna",
  WS: "Samoa",
  XK: "Kosovo",
  YE: "Yemen",
  YT: "Mayotte",
  ZA: "South Africa",
  ZM: "Zambia",
  ZW: "Zimbabwe",
};

function buildCountryOptions(): readonly CountryOption[] {
  const allCountries = getCountries();
  const prioritySet = new Set<CountryCode>(PRIORITY_COUNTRY_CODES);

  const toOption = (code: CountryCode): CountryOption => {
    const callingCode = `+${getCountryCallingCode(code)}`;
    const name = REGION_NAMES_EN[code] ?? code;
    return {
      code,
      name,
      callingCode,
      label: `${name} (${callingCode})`,
    };
  };

  const priorityOptions = PRIORITY_COUNTRY_CODES.filter((code) =>
    allCountries.includes(code),
  ).map(toOption);

  const restOptions = allCountries
    .filter((code) => !prioritySet.has(code))
    .map(toOption)
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  return [...priorityOptions, ...restOptions];
}

export const COUNTRY_OPTIONS: readonly CountryOption[] = buildCountryOptions();
const VALID_COUNTRY_SET = new Set<string>(getCountries());

const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const HAS_LETTER_RE = /\p{L}/u;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function sanitizeTextInput(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(CONTROL_CHARS_RE, "").trim();
}

export function normalizePhoneCountry(raw: unknown): CountryCode | null {
  if (typeof raw !== "string") return null;
  const upper = raw.trim().toUpperCase();
  if (!VALID_COUNTRY_SET.has(upper)) return null;
  return upper as CountryCode;
}

export function normalizeAndValidateName(raw: unknown): {
  valid: boolean;
  value: string;
  error?: string;
} {
  const value = sanitizeTextInput(raw).replace(/\s+/g, " ");
  if (!value) {
    return {
      valid: false,
      value: "",
      error: "Please enter your full name.",
    };
  }
  if (value.length < RSVP_LIMITS.nameMinLength) {
    return {
      valid: false,
      value,
      error: `Full name must be at least ${RSVP_LIMITS.nameMinLength} characters.`,
    };
  }
  if (value.length > RSVP_LIMITS.nameMaxLength) {
    return {
      valid: false,
      value,
      error: `Full name must be ${RSVP_LIMITS.nameMaxLength} characters or fewer.`,
    };
  }
  if (!HAS_LETTER_RE.test(value)) {
    return {
      valid: false,
      value,
      error: "Please enter a valid full name.",
    };
  }
  return { valid: true, value };
}

export function normalizeAndValidatePhone(
  rawPhone: unknown,
  rawCountry: unknown = DEFAULT_PHONE_COUNTRY,
): {
  valid: boolean;
  e164: string;
  country: CountryCode;
  nationalFormatted: string;
  error?: string;
} {
  const country = normalizePhoneCountry(rawCountry) ?? DEFAULT_PHONE_COUNTRY;
  const cleaned = sanitizeTextInput(rawPhone);

  if (!cleaned) {
    return {
      valid: false,
      e164: "",
      country,
      nationalFormatted: "",
      error: "Please enter your phone number.",
    };
  }

  // Reject clearly non-phone payloads containing letters
  if (/[a-zA-Z]/.test(cleaned)) {
    return {
      valid: false,
      e164: "",
      country,
      nationalFormatted: "",
      error: "Please enter a valid phone number without letters.",
    };
  }

  const normalizedInput = cleaned.startsWith("00")
    ? `+${cleaned.slice(2)}`
    : cleaned;

  const parsed = parsePhoneNumberFromString(normalizedInput, country);
  if (!parsed || !parsed.isValid()) {
    return {
      valid: false,
      e164: "",
      country,
      nationalFormatted: "",
      error:
        country === "KE"
          ? "Please enter a valid Kenyan phone number (e.g., 0712 345 678 or 0112 345 678) or select your country."
          : "Please enter a valid phone number for the selected country.",
    };
  }

  const resolvedCountry = parsed.country ?? country;

  return {
    valid: true,
    e164: parsed.number,
    country: resolvedCountry,
    nationalFormatted: parsed.formatNational(),
  };
}

export function validateAttendance(raw: unknown): {
  valid: boolean;
  value?: AttendanceStatus;
  error?: string;
} {
  if (raw === "attending" || raw === "declining") {
    return { valid: true, value: raw };
  }
  return {
    valid: false,
    error: "Please select whether you will be attending or declining.",
  };
}

export function validateDietaryRequirements(
  raw: unknown,
  attendance: AttendanceStatus | undefined,
): {
  valid: boolean;
  value: string | null;
  error?: string;
} {
  if (attendance !== "attending") {
    return { valid: true, value: null };
  }
  const value = sanitizeTextInput(raw);
  if (!value) {
    return { valid: true, value: null };
  }
  if (value.length > RSVP_LIMITS.dietaryMaxLength) {
    return {
      valid: false,
      value,
      error: `Dietary requirements must be ${RSVP_LIMITS.dietaryMaxLength} characters or fewer.`,
    };
  }
  return { valid: true, value };
}

export function validateCongratulatoryMessage(raw: unknown): {
  valid: boolean;
  value: string | null;
  error?: string;
} {
  const value = sanitizeTextInput(raw);
  if (!value) {
    return { valid: true, value: null };
  }
  if (value.length > RSVP_LIMITS.messageMaxLength) {
    return {
      valid: false,
      value,
      error: `Congratulatory message must be ${RSVP_LIMITS.messageMaxLength} characters or fewer.`,
    };
  }
  return { valid: true, value };
}

export interface NormalizedRsvpData {
  fullName: string;
  phoneE164: string;
  phoneCountry: CountryCode;
  attendance: AttendanceStatus;
  attendeeCount: 1 | 0;
  dietaryRequirements: string | null;
  congratulatoryMessage: string | null;
  idempotencyKey: string | null;
}

export function validateCreateRsvpInput(
  input: Partial<RsvpSubmissionInput> & Record<string, unknown>,
):
  | { valid: true; data: NormalizedRsvpData }
  | { valid: false; honeypotTriggered: boolean; fieldErrors: RsvpFieldErrors; message: string } {
  const honeypot = typeof input.honeypot === "string" ? input.honeypot.trim() : "";
  if (honeypot.length > 0) {
    return {
      valid: false,
      honeypotTriggered: true,
      fieldErrors: {},
      message:
        "Unable to process your RSVP submission. Please check your entries and try again.",
    };
  }

  const fieldErrors: RsvpFieldErrors = {};

  const nameResult = normalizeAndValidateName(input.fullName);
  if (!nameResult.valid && nameResult.error) {
    fieldErrors.fullName = nameResult.error;
  }

  const explicitCountry = normalizePhoneCountry(input.phoneCountry);
  if (input.phoneCountry !== undefined && !explicitCountry) {
    fieldErrors.phoneCountry = "Please select a valid country.";
  }

  const phoneResult = normalizeAndValidatePhone(
    input.phoneNumber,
    explicitCountry ?? DEFAULT_PHONE_COUNTRY,
  );
  if (!phoneResult.valid && phoneResult.error) {
    fieldErrors.phoneNumber = phoneResult.error;
  }

  const attendanceResult = validateAttendance(input.attendance);
  if (!attendanceResult.valid && attendanceResult.error) {
    fieldErrors.attendance = attendanceResult.error;
  }

  const dietaryResult = validateDietaryRequirements(
    input.dietaryRequirements,
    attendanceResult.value,
  );
  if (!dietaryResult.valid && dietaryResult.error) {
    fieldErrors.dietaryRequirements = dietaryResult.error;
  }

  const messageResult = validateCongratulatoryMessage(
    input.congratulatoryMessage,
  );
  if (!messageResult.valid && messageResult.error) {
    fieldErrors.congratulatoryMessage = messageResult.error;
  }

  if (input.privacyAcknowledged !== true) {
    fieldErrors.privacyAcknowledged =
      "Please confirm that you have read and understood the privacy notice.";
  }

  let idempotencyKey: string | null = null;
  if (typeof input.idempotencyKey === "string" && input.idempotencyKey.trim()) {
    const trimmedKey = input.idempotencyKey.trim();
    if (UUID_RE.test(trimmedKey)) {
      idempotencyKey = trimmedKey.toLowerCase();
    }
  }

  if (Object.keys(fieldErrors).length > 0 || !attendanceResult.value) {
    return {
      valid: false,
      honeypotTriggered: false,
      fieldErrors,
      message: "Please review the highlighted fields and try again.",
    };
  }

  return {
    valid: true,
    data: {
      fullName: nameResult.value,
      phoneE164: phoneResult.e164,
      phoneCountry: phoneResult.country,
      attendance: attendanceResult.value,
      attendeeCount: attendanceResult.value === "attending" ? 1 : 0,
      dietaryRequirements: dietaryResult.value,
      congratulatoryMessage: messageResult.value,
      idempotencyKey,
    },
  };
}

export function validateUpdateRsvpInput(
  input: Partial<RsvpUpdateInput> & Record<string, unknown>,
):
  | { valid: true; data: Omit<NormalizedRsvpData, "idempotencyKey"> }
  | { valid: false; fieldErrors: RsvpFieldErrors; message: string } {
  const fieldErrors: RsvpFieldErrors = {};

  const nameResult = normalizeAndValidateName(input.fullName);
  if (!nameResult.valid && nameResult.error) {
    fieldErrors.fullName = nameResult.error;
  }

  const explicitCountry = normalizePhoneCountry(input.phoneCountry);
  if (input.phoneCountry !== undefined && !explicitCountry) {
    fieldErrors.phoneCountry = "Please select a valid country.";
  }

  const phoneResult = normalizeAndValidatePhone(
    input.phoneNumber,
    explicitCountry ?? DEFAULT_PHONE_COUNTRY,
  );
  if (!phoneResult.valid && phoneResult.error) {
    fieldErrors.phoneNumber = phoneResult.error;
  }

  const attendanceResult = validateAttendance(input.attendance);
  if (!attendanceResult.valid && attendanceResult.error) {
    fieldErrors.attendance = attendanceResult.error;
  }

  const dietaryResult = validateDietaryRequirements(
    input.dietaryRequirements,
    attendanceResult.value,
  );
  if (!dietaryResult.valid && dietaryResult.error) {
    fieldErrors.dietaryRequirements = dietaryResult.error;
  }

  const messageResult = validateCongratulatoryMessage(
    input.congratulatoryMessage,
  );
  if (!messageResult.valid && messageResult.error) {
    fieldErrors.congratulatoryMessage = messageResult.error;
  }

  if (Object.keys(fieldErrors).length > 0 || !attendanceResult.value) {
    return {
      valid: false,
      fieldErrors,
      message: "Please review the highlighted fields and try again.",
    };
  }

  return {
    valid: true,
    data: {
      fullName: nameResult.value,
      phoneE164: phoneResult.e164,
      phoneCountry: phoneResult.country,
      attendance: attendanceResult.value,
      attendeeCount: attendanceResult.value === "attending" ? 1 : 0,
      dietaryRequirements: dietaryResult.value,
      congratulatoryMessage: messageResult.value,
    },
  };
}
