import assert from "node:assert/strict";

function deepFreeze(obj) {
  if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const val of Object.values(obj)) {
      deepFreeze(val);
    }
  }
  return obj;
}

export const SPEC = deepFreeze({
  palette: {
    warmIvory: "#F7F3EA",
    forestGreen: "#193C2F",
    softSage: "#A5B29A",
    mutedOlive: "#77774D",
    champagneGold: "#C4A46C",
    warmSand: "#E8DED0",
  },
  copy: {
    navLinks: [
      "Home",
      "The Graduates",
      "Celebration Details",
      "Gallery",
      "RSVP",
    ],
    heroEyebrow: "YOU ARE CORDIALLY INVITED TO THE",
    heroTitle: "Graduation & Thanksgiving Celebration",
    heroSubEyebrow: "OF",
    graduatesShort: "Majala & Florence",
    heroParagraph:
      "Join us as we celebrate our graduation, give thanks for God's faithfulness, and mark the completion of five years of learning, growth and grace.",
    graduatesHeading: "Meet the Graduates",
    majalaName: "Majala Mwaila",
    majalaDegree: "Bachelor's Degree in Education (Mathematics)",
    florenceName: "Florence Achala Mwaila",
    florenceDegree: "Bachelor's Degree in French and Sociology",
    celebrationDate: "Saturday, 12 December 2026",
    celebrationTime: "12:00 PM",
    venueName: "Rainbow Ruiru Resort",
    galleryHeading: "Our Journey in Pictures",
    rsvpHeading: "Kindly RSVP",
    rsvpCopy:
      "Please confirm your attendance so we can plan and celebrate with you.",
    rsvpCta: "RSVP Now \u2192",
    thankYouHeading: "Thank You",
    thankYouCopy:
      "To our family, friends, mentors and everyone who has walked this journey with us \u2014 thank you for your love, encouragement, prayers and unwavering support.",
    signature: "Majala & Florence",
  },
  mapsUrlExact:
    "https://www.google.com/maps/dir/?api=1&destination=Rainbow+Ruiru+Resort%2C+Ruiru%2C+Kenya",
  mapsUrlPrefix: "https://www.google.com/maps/dir/",
  mapsDestinationPattern: /Rainbow\+Ruiru\+Resort|Rainbow%20Ruiru%20Resort/i,
  viewports: {
    desktop: { width: 1440, height: 900, mobile: false, deviceScaleFactor: 1 },
    tabletDesktopMin: {
      width: 1024,
      height: 768,
      mobile: false,
      deviceScaleFactor: 1,
    },
    mobile: { width: 390, height: 844, mobile: true, deviceScaleFactor: 1 },
    smallMobile: {
      width: 375,
      height: 812,
      mobile: true,
      deviceScaleFactor: 1,
    },
  },
});

const CSS_NUM_PATTERN = "[+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?";
const CSS_COMPONENT_RE = new RegExp(`^(?:(${CSS_NUM_PATTERN})(%?)|none)$`, "i");
const CSS_HUE_RE = new RegExp(
  `^(?:(${CSS_NUM_PATTERN})(deg|rad|grad|turn)?|none)$`,
  "i",
);

const LAB_KAPPA = 24389 / 27;
const LAB_EPSILON = 216 / 24389;
const D50_WHITE = [0.3457 / 0.3585, 1.0, (1.0 - 0.3457 - 0.3585) / 0.3585];
const BRADFORD_D50_TO_D65 = [
  [0.9554734527042182, -0.023098536874261423, 0.0632593086610217],
  [-0.028369706963208136, 1.0099954580058226, 0.021041398966943008],
  [0.012314001688319899, -0.020507696433477912, 1.3303659366080753],
];
const XYZ_D65_TO_LINEAR_SRGB = [
  [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
  [-0.9692436362808796, 1.8759675015077202, 0.04155505740717557],
  [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
];

function parseCssComponent(token, percentScale = 1) {
  const m = token.trim().match(CSS_COMPONENT_RE);
  if (!m) return NaN;
  if (m[1] === undefined) return 0;
  const num = Number(m[1]);
  if (!Number.isFinite(num)) return NaN;
  return m[2] === "%" ? (num / 100) * percentScale : num;
}

function parseCssHueDegrees(token) {
  const m = token.trim().match(CSS_HUE_RE);
  if (!m) return NaN;
  if (m[1] === undefined) return 0;
  const num = Number(m[1]);
  if (!Number.isFinite(num)) return NaN;
  const unit = (m[2] || "deg").toLowerCase();
  if (unit === "deg") return num;
  if (unit === "rad") return (num * 180) / Math.PI;
  if (unit === "grad") return num * 0.9;
  if (unit === "turn") return num * 360;
  return NaN;
}

function parseCssAlpha(token) {
  if (token === undefined) return 1;
  const val = parseCssComponent(token, 1);
  if (!Number.isFinite(val)) return NaN;
  return Math.min(1, Math.max(0, val));
}

function multiplyMatrix3x3(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

function linearSrgbChannelToSrgb(c) {
  const sign = c < 0 ? -1 : 1;
  const abs = Math.abs(c);
  return abs > 0.0031308
    ? sign * (1.055 * abs ** (1 / 2.4) - 0.055)
    : 12.92 * c;
}

function formatRgbResult(r, g, b, a) {
  const cr = Math.min(255, Math.max(0, Math.round(r)));
  const cg = Math.min(255, Math.max(0, Math.round(g)));
  const cb = Math.min(255, Math.max(0, Math.round(b)));
  return { r: cr, g: cg, b: cb, a, rgb: `rgb(${cr}, ${cg}, ${cb})` };
}

function linearSrgbToRgbResult(lr, lg, lb, a) {
  return formatRgbResult(
    linearSrgbChannelToSrgb(lr) * 255,
    linearSrgbChannelToSrgb(lg) * 255,
    linearSrgbChannelToSrgb(lb) * 255,
    a,
  );
}

function labToRgbResult(L, aLab, bLab, alpha) {
  const clampedL = Math.max(0, L);
  const f1 = (clampedL + 16) / 116;
  const f0 = aLab / 500 + f1;
  const f2 = f1 - bLab / 200;

  const xr = f0 ** 3 > LAB_EPSILON ? f0 ** 3 : (116 * f0 - 16) / LAB_KAPPA;
  const yr =
    clampedL > LAB_KAPPA * LAB_EPSILON
      ? ((clampedL + 16) / 116) ** 3
      : clampedL / LAB_KAPPA;
  const zr = f2 ** 3 > LAB_EPSILON ? f2 ** 3 : (116 * f2 - 16) / LAB_KAPPA;

  const xyzD50 = [xr * D50_WHITE[0], yr * D50_WHITE[1], zr * D50_WHITE[2]];
  const xyzD65 = multiplyMatrix3x3(BRADFORD_D50_TO_D65, xyzD50);
  const [lr, lg, lb] = multiplyMatrix3x3(XYZ_D65_TO_LINEAR_SRGB, xyzD65);
  return linearSrgbToRgbResult(lr, lg, lb, alpha);
}

function oklabToRgbResult(L, aLab, bLab, alpha) {
  const clampedL = Math.max(0, L);
  const l_ = clampedL + 0.3963377774 * aLab + 0.2158037573 * bLab;
  const m_ = clampedL - 0.1055613458 * aLab - 0.0638541728 * bLab;
  const s_ = clampedL - 0.0894841775 * aLab - 1.291485548 * bLab;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return linearSrgbToRgbResult(lr, lg, lb, alpha);
}

export function normalizeRgb(colorString) {
  if (!colorString || typeof colorString !== "string") return null;
  const trimmed = colorString.trim();

  if (trimmed.startsWith("#")) {
    const hex = trimmed.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      const a = hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : 1;
      return { r, g, b, a, rgb: `rgb(${r}, ${g}, ${b})` };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a, rgb: `rgb(${r}, ${g}, ${b})` };
    }
    return null;
  }

  const commaMatch = trimmed.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i,
  );
  if (commaMatch) {
    const r = Math.round(Number(commaMatch[1]));
    const g = Math.round(Number(commaMatch[2]));
    const b = Math.round(Number(commaMatch[3]));
    const a = commaMatch[4] !== undefined ? Number(commaMatch[4]) : 1;
    return { r, g, b, a, rgb: `rgb(${r}, ${g}, ${b})` };
  }

  const spaceMatch = trimmed.match(
    /^rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/i,
  );
  if (spaceMatch) {
    const r = Math.round(Number(spaceMatch[1]));
    const g = Math.round(Number(spaceMatch[2]));
    const b = Math.round(Number(spaceMatch[3]));
    let a = 1;
    if (spaceMatch[4] !== undefined) {
      a = spaceMatch[4].endsWith("%")
        ? parseFloat(spaceMatch[4]) / 100
        : Number(spaceMatch[4]);
    }
    return { r, g, b, a, rgb: `rgb(${r}, ${g}, ${b})` };
  }

  const colorSrgbMatch = trimmed.match(
    /^color\(\s*srgb\s+([^\s/]+)\s+([^\s/]+)\s+([^\s/)]+)(?:\s*\/\s*([^\s)]+))?\s*\)$/i,
  );
  if (colorSrgbMatch) {
    const r = parseCssComponent(colorSrgbMatch[1], 1);
    const g = parseCssComponent(colorSrgbMatch[2], 1);
    const b = parseCssComponent(colorSrgbMatch[3], 1);
    const a = parseCssAlpha(colorSrgbMatch[4]);
    if (
      !Number.isFinite(r) ||
      !Number.isFinite(g) ||
      !Number.isFinite(b) ||
      !Number.isFinite(a)
    ) {
      return null;
    }
    return formatRgbResult(r * 255, g * 255, b * 255, a);
  }

  const labMatch = trimmed.match(
    /^lab\(\s*([^\s/]+)\s+([^\s/]+)\s+([^\s/)]+)(?:\s*\/\s*([^\s)]+))?\s*\)$/i,
  );
  if (labMatch) {
    const L = parseCssComponent(labMatch[1], 100);
    const aLab = parseCssComponent(labMatch[2], 125);
    const bLab = parseCssComponent(labMatch[3], 125);
    const a = parseCssAlpha(labMatch[4]);
    if (
      !Number.isFinite(L) ||
      !Number.isFinite(aLab) ||
      !Number.isFinite(bLab) ||
      !Number.isFinite(a)
    ) {
      return null;
    }
    return labToRgbResult(L, aLab, bLab, a);
  }

  const oklabMatch = trimmed.match(
    /^oklab\(\s*([^\s/]+)\s+([^\s/]+)\s+([^\s/)]+)(?:\s*\/\s*([^\s)]+))?\s*\)$/i,
  );
  if (oklabMatch) {
    const L = parseCssComponent(oklabMatch[1], 1);
    const aLab = parseCssComponent(oklabMatch[2], 0.4);
    const bLab = parseCssComponent(oklabMatch[3], 0.4);
    const a = parseCssAlpha(oklabMatch[4]);
    if (
      !Number.isFinite(L) ||
      !Number.isFinite(aLab) ||
      !Number.isFinite(bLab) ||
      !Number.isFinite(a)
    ) {
      return null;
    }
    return oklabToRgbResult(L, aLab, bLab, a);
  }

  const oklchMatch = trimmed.match(
    /^oklch\(\s*([^\s/]+)\s+([^\s/]+)\s+([^\s/)]+)(?:\s*\/\s*([^\s)]+))?\s*\)$/i,
  );
  if (oklchMatch) {
    const L = parseCssComponent(oklchMatch[1], 1);
    const rawC = parseCssComponent(oklchMatch[2], 0.4);
    const hueDeg = parseCssHueDegrees(oklchMatch[3]);
    const a = parseCssAlpha(oklchMatch[4]);
    if (
      !Number.isFinite(L) ||
      !Number.isFinite(rawC) ||
      !Number.isFinite(hueDeg) ||
      !Number.isFinite(a)
    ) {
      return null;
    }
    const C = Math.max(0, rawC);
    const hueRad = (hueDeg * Math.PI) / 180;
    return oklabToRgbResult(L, C * Math.cos(hueRad), C * Math.sin(hueRad), a);
  }

  return null;
}

export function parseRgb(colorString) {
  return normalizeRgb(colorString);
}

export function colorsMatch(actual, expected, tolerance = 3) {
  const c1 = normalizeRgb(actual);
  const c2 = normalizeRgb(expected);
  if (!c1 || !c2) return false;
  if (c1.a === 0 || c2.a === 0) return false;
  return (
    Math.abs(c1.r - c2.r) <= tolerance &&
    Math.abs(c1.g - c2.g) <= tolerance &&
    Math.abs(c1.b - c2.b) <= tolerance
  );
}

export function assertColorMatches(
  actual,
  expected,
  label = "color",
  tolerance = 3,
) {
  assert.ok(
    colorsMatch(actual, expected, tolerance),
    `Expected ${label} (${actual}) to match ${expected} within tolerance ${tolerance}`,
  );
}

export function relativeLuminance(colorString) {
  const c = typeof colorString === "string" ? normalizeRgb(colorString) : colorString;
  if (!c) return 0;
  const channel = (val) => {
    const s = val / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

export function contrastRatio(fgColor, bgColor) {
  const l1 = relativeLuminance(fgColor);
  const l2 = relativeLuminance(bgColor);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function normalizeText(str) {
  return String(str ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function assertExactTextPresent(
  fullText,
  expectedPhrase,
  label = "text",
) {
  const normalizedFull = normalizeText(fullText);
  const normalizedExpected = normalizeText(expectedPhrase);
  assert.ok(
    normalizedFull.includes(normalizedExpected),
    `Expected ${label} to include "${normalizedExpected}"`,
  );
}

export function assertNoCountdown(bodyText) {
  const text = normalizeText(bodyText);
  const forbiddenPatterns = [
    /\bcountdown\b/i,
    /\bdays?\s+left\b/i,
    /\bhours?\s+left\b/i,
    /\bminutes?\s+left\b/i,
    /\bseconds?\s+left\b/i,
    /\btime\s+remaining\b/i,
    /\b\d+\s*d\s*:\s*\d+\s*h\b/i,
  ];
  for (const pat of forbiddenPatterns) {
    assert.ok(
      !pat.test(text),
      `Forbidden countdown pattern matched (${pat}) in page text`,
    );
  }
  const hasCountdownUnitsTogether =
    /\bdays\b/i.test(text) &&
    /\bhours\b/i.test(text) &&
    /\bminutes\b/i.test(text);
  assert.ok(
    !hasCountdownUnitsTogether,
    "Forbidden countdown unit cluster (days + hours + minutes) detected",
  );
}

export async function getPageSnapshot(session) {
  return session.evaluate(() => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const headings = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].map(
      (el) => ({
        tag: el.tagName.toLowerCase(),
        level: Number(el.tagName.slice(1)),
        text: norm(el.innerText || el.textContent),
        rect: el.getBoundingClientRect().toJSON(),
      }),
    );
    return {
      title: document.title || "",
      lang: document.documentElement.lang || "",
      bodyText: document.body ? document.body.innerText || "" : "",
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      hasHeader: document.querySelectorAll("header").length > 0,
      hasMain: document.querySelectorAll("main").length > 0,
      hasFooter: document.querySelectorAll("footer").length > 0,
      headerCount: document.querySelectorAll("header").length,
      mainCount: document.querySelectorAll("main").length,
      footerCount: document.querySelectorAll("footer").length,
      h1Count: document.querySelectorAll("h1").length,
      h2Count: document.querySelectorAll("h2").length,
      headings,
    };
  });
}

export async function findSectionRect(
  session,
  markerText,
  preferredTags = ["header", "section", "footer", "main"],
) {
  return session.evaluate(
    (needle, tags) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const target = norm(needle);
      const all = [...document.querySelectorAll("*")].filter((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return (
          r.width > 0 &&
          r.height > 0 &&
          cs.display !== "none" &&
          cs.visibility !== "hidden" &&
          norm(el.innerText).includes(target)
        );
      });
      if (all.length === 0) {
        return { found: false };
      }
      // Smallest element containing the marker text
      all.sort(
        (a, b) =>
          a.getBoundingClientRect().width * a.getBoundingClientRect().height -
          b.getBoundingClientRect().width * b.getBoundingClientRect().height,
      );
      const leaf = all[0];
      const selector = tags.join(", ");
      const section = leaf.closest(selector) || leaf;
      const rect = section.getBoundingClientRect();
      const cs = getComputedStyle(section);
      return {
        found: true,
        tag: section.tagName.toLowerCase(),
        id: section.id || "",
        rect: rect.toJSON(),
        backgroundColor: cs.backgroundColor,
        borderColor: cs.borderTopColor,
        color: cs.color,
      };
    },
    markerText,
    preferredTags,
  );
}

export async function findSectionByText(
  session,
  needle,
  ancestorSelector = "section, footer, main, header",
) {
  return session.evaluate(
    (targetText, selector) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const expected = norm(targetText);
      const candidates = [...document.querySelectorAll(selector)].filter(
        (el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return (
            r.width > 0 &&
            r.height > 0 &&
            cs.display !== "none" &&
            cs.visibility !== "hidden" &&
            norm(el.innerText).includes(expected)
          );
        },
      );
      if (candidates.length === 0) {
        return { found: false };
      }
      // Pick deepest / smallest matching semantic container
      candidates.sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return ra.width * ra.height - rb.width * rb.height;
      });
      const el = candidates[0];
      const cs = getComputedStyle(el);
      return {
        found: true,
        tag: el.tagName.toLowerCase(),
        id: el.id || "",
        text: norm(el.innerText),
        rect: el.getBoundingClientRect().toJSON(),
        backgroundColor: cs.backgroundColor,
        color: cs.color,
      };
    },
    needle,
    ancestorSelector,
  );
}

export async function getComputedStyleForText(
  session,
  targetText,
  selectorHint = "*",
) {
  return session.evaluate(
    (needle, sel) => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
      const expected = norm(needle);
      const matches = [...document.querySelectorAll(sel)].filter((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (
          r.width <= 0 ||
          r.height <= 0 ||
          cs.display === "none" ||
          cs.visibility === "hidden"
        ) {
          return false;
        }
        return norm(el.innerText).includes(expected);
      });
      if (matches.length === 0) {
        return { found: false };
      }
      const exactMatches = matches.filter((el) => norm(el.innerText) === expected);
      const pool = exactMatches.length > 0 ? exactMatches : matches;
      pool.sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return ra.width * ra.height - rb.width * rb.height;
      });
      const el = pool[0];
      const cs = getComputedStyle(el);
      return {
        found: true,
        tag: el.tagName.toLowerCase(),
        text: norm(el.innerText),
        rawText: (el.innerText || "").trim(),
        rect: el.getBoundingClientRect().toJSON(),
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        fontFamily: cs.fontFamily,
        fontStyle: cs.fontStyle,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        borderTopLeftRadius: cs.borderTopLeftRadius,
        borderTopRightRadius: cs.borderTopRightRadius,
        borderBottomLeftRadius: cs.borderBottomLeftRadius,
        borderBottomRightRadius: cs.borderBottomRightRadius,
        cursor: cs.cursor,
      };
    },
    targetText,
    selectorHint,
  );
}

export async function getNavSummary(session) {
  return session.evaluate((expectedLabels) => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const header = document.querySelector("header");
    if (!header) {
      return {
        found: false,
        headerRect: null,
        headerBg: null,
        wordmark: null,
        links: [],
        hamburger: null,
      };
    }

    const headerCs = getComputedStyle(header);
    const headerRect = header.getBoundingClientRect().toJSON();

    const isElVisible = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return (
        r.width > 0 &&
        r.height > 0 &&
        cs.display !== "none" &&
        cs.visibility !== "hidden" &&
        cs.opacity !== "0"
      );
    };

    const wordmarkCandidates = [...header.querySelectorAll("a, span, p, div")].filter(
      (el) => norm(el.innerText) === "Majala & Florence",
    );
    wordmarkCandidates.sort(
      (a, b) =>
        a.getBoundingClientRect().width * a.getBoundingClientRect().height -
        b.getBoundingClientRect().width * b.getBoundingClientRect().height,
    );
    const wmEl = wordmarkCandidates[0] || null;
    const wordmark = wmEl
      ? {
          found: true,
          visible: isElVisible(wmEl),
          rect: wmEl.getBoundingClientRect().toJSON(),
          fontFamily: getComputedStyle(wmEl).fontFamily,
          fontStyle: getComputedStyle(wmEl).fontStyle,
          color: getComputedStyle(wmEl).color,
        }
      : { found: false };

    const navRootControls = [
      ...document.querySelectorAll(
        "header a, header button, nav a, nav button, [role='dialog'] a, [role='dialog'] button",
      ),
    ];

    const links = expectedLabels.map((label) => {
      const matching = navRootControls.filter(
        (el) => norm(el.innerText || el.textContent) === label,
      );
      const visibleMatches = matching.filter(isElVisible);
      const chosen = visibleMatches[0] || matching[0] || null;
      if (!chosen) {
        return {
          text: label,
          found: false,
          visible: false,
          href: null,
          isHash: false,
          targetExists: false,
          rect: null,
          backgroundColor: null,
          borderColor: null,
          color: null,
          fontFamily: null,
        };
      }
      const href = chosen.getAttribute("href");
      const isHash = typeof href === "string" && href.startsWith("#") && href.length > 1;
      const targetId = isHash ? href.slice(1) : null;
      const targetExists = targetId ? Boolean(document.getElementById(targetId)) : false;
      const cs = getComputedStyle(chosen);
      return {
        text: label,
        found: true,
        visible: isElVisible(chosen),
        tag: chosen.tagName.toLowerCase(),
        href,
        isHash,
        targetId,
        targetExists,
        rect: chosen.getBoundingClientRect().toJSON(),
        backgroundColor: cs.backgroundColor,
        borderColor: cs.borderTopColor,
        color: cs.color,
        fontFamily: cs.fontFamily,
      };
    });

    const buttonsInHeader = [...header.querySelectorAll("button")];
    const hamburgerEl =
      buttonsInHeader.find(
        (btn) =>
          btn.hasAttribute("aria-expanded") ||
          /menu|navigation|toggle/i.test(btn.getAttribute("aria-label") || ""),
      ) || null;

    const hamburger = hamburgerEl
      ? {
          found: true,
          visible: isElVisible(hamburgerEl),
          ariaExpanded: hamburgerEl.getAttribute("aria-expanded"),
          ariaLabel: hamburgerEl.getAttribute("aria-label") || "",
          rect: hamburgerEl.getBoundingClientRect().toJSON(),
          display: getComputedStyle(hamburgerEl).display,
          visibility: getComputedStyle(hamburgerEl).visibility,
        }
      : { found: false, visible: false, ariaExpanded: null, rect: null };

    return {
      found: true,
      headerRect,
      headerBg: headerCs.backgroundColor,
      headerBorderBottomColor: headerCs.borderBottomColor,
      wordmark,
      links,
      hamburger,
    };
  }, SPEC.copy.navLinks);
}

export async function getImagesAudit(session) {
  return session.evaluate(() => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const gallerySection = [...document.querySelectorAll("section")].find((sec) =>
      norm(sec.innerText).includes("Our Journey in Pictures"),
    );
    const images = [...document.querySelectorAll("img")].map((img) => {
      const rect = img.getBoundingClientRect();
      const cs = getComputedStyle(img);
      const visible =
        rect.width > 0 &&
        rect.height > 0 &&
        cs.display !== "none" &&
        cs.visibility !== "hidden" &&
        cs.opacity !== "0";
      return {
        src: img.getAttribute("src") || "",
        currentSrc: img.currentSrc || img.src || "",
        alt: img.getAttribute("alt") ?? "",
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        objectFit: cs.objectFit,
        rect: rect.toJSON(),
        visible,
        isDecorative: Boolean(img.closest('[aria-hidden="true"]')),
        inGallery: gallerySection ? gallerySection.contains(img) : false,
      };
    });
    return { total: images.length, images };
  });
}

export async function assertAllImagesLoaded(session, { minCount = 1 } = {}) {
  const audit = await getImagesAudit(session);
  assert.ok(
    audit.total >= minCount,
    `Expected at least ${minCount} <img> elements, found ${audit.total}`,
  );
  for (const img of audit.images) {
    assert.ok(
      img.complete && img.naturalWidth > 0 && img.naturalHeight > 0,
      `Broken image detected: src="${img.src}" alt="${img.alt}" complete=${img.complete} naturalWidth=${img.naturalWidth}`,
    );
  }
  return audit;
}

export async function assertNoHorizontalOverflow(session, maxWidth) {
  const dims = await session.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  const limit = maxWidth ?? dims.innerWidth;
  assert.ok(
    dims.scrollWidth <= limit,
    `Horizontal overflow detected: scrollWidth=${dims.scrollWidth} > limit=${limit}`,
  );
  return dims;
}

export async function auditFaceAndTextNonObstruction(session) {
  return session.evaluate(() => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const failures = [];
    let checkedTargets = 0;

    const isDecorativeOrOpaqueOverlay = (el, targetEl) => {
      if (el === targetEl || el.contains(targetEl) || targetEl.contains(el)) {
        return false;
      }
      const tag = el.tagName.toLowerCase();
      const cs = getComputedStyle(el);
      if (tag === "img" && (el.getAttribute("alt") ?? "").trim() === "") {
        return true;
      }
      if (tag === "svg" || el.closest("svg")) {
        return true;
      }
      if (cs.pointerEvents === "none") {
        // Transparent feathering/gradient pass-through layers are allowed over portrait edges,
        // unless they are decorative images/SVGs (handled above) or opaque solid blockers.
        const bg = cs.backgroundColor;
        const m = bg.match(/rgba?\([^)]+,\s*([\d.]+)\s*\)/i);
        const alpha = m ? Number(m[1]) : bg === "transparent" ? 0 : 1;
        if (alpha >= 0.85 && !el.innerText.trim()) {
          return true;
        }
        return false;
      }
      return true;
    };

    const probePoint = (x, y, targetEl, label) => {
      if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) {
        return;
      }
      const stack = document.elementsFromPoint(x, y);
      for (const topEl of stack) {
        if (topEl === targetEl || targetEl.contains(topEl)) {
          break;
        }
        if (isDecorativeOrOpaqueOverlay(topEl, targetEl)) {
          failures.push({
            label,
            blockerTag: topEl.tagName.toLowerCase(),
            blockerAlt: topEl.getAttribute("alt") || "",
            blockerText: norm(topEl.innerText).slice(0, 40),
          });
          break;
        }
      }
    };

    const textTargets = [
      ...document.querySelectorAll("h1, h2, footer p, header a, main a, main button"),
    ].filter((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return (
        r.width > 0 &&
        r.height > 0 &&
        cs.display !== "none" &&
        cs.visibility !== "hidden" &&
        norm(el.innerText).length > 0
      );
    });

    for (const el of textTargets) {
      el.scrollIntoView({ block: "center", inline: "center" });
      const r = el.getBoundingClientRect();
      checkedTargets++;
      probePoint(
        r.left + r.width / 2,
        r.top + r.height / 2,
        el,
        `text:${el.tagName.toLowerCase()}:${norm(el.innerText).slice(0, 30)}`,
      );
    }

    const subjectImgs = [...document.querySelectorAll("img")].filter((img) => {
      const r = img.getBoundingClientRect();
      const cs = getComputedStyle(img);
      return (
        (img.getAttribute("alt") ?? "").trim().length > 0 &&
        r.width >= 80 &&
        r.height >= 80 &&
        cs.display !== "none" &&
        cs.visibility !== "hidden"
      );
    });

    for (const img of subjectImgs) {
      img.scrollIntoView({ block: "center", inline: "center" });
      const r = img.getBoundingClientRect();
      checkedTargets++;
      for (const fx of [0.35, 0.5, 0.65]) {
        for (const fy of [0.25, 0.35]) {
          probePoint(
            r.left + r.width * fx,
            r.top + r.height * fy,
            img,
            `img:${img.alt.slice(0, 24)}@${fx},${fy}`,
          );
        }
      }
    }

    return { checkedTargets, failures };
  });
}

export async function auditForbiddenStylesAndAnimations(session) {
  return session.evaluate(() => {
    const runningAnimations = document.getAnimations().length;
    const animationElements = [];
    const blurElements = [];
    const keyframeRules = [];

    for (const sheet of [...document.styleSheets]) {
      try {
        for (const rule of [...(sheet.cssRules || [])]) {
          if (rule.type === CSSRule.KEYFRAMES_RULE) {
            keyframeRules.push(rule.name || "unnamed");
          }
        }
      } catch {
        // ignore cross-origin stylesheet restrictions
      }
    }

    for (const el of [...document.querySelectorAll("*")]) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width <= 0 && r.height <= 0) continue;
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      if (cs.animationName && cs.animationName !== "none") {
        animationElements.push({
          tag: el.tagName.toLowerCase(),
          animationName: cs.animationName,
        });
      }
      const bf = cs.backdropFilter || "";
      const wbf = cs.webkitBackdropFilter || "";
      if (/blur\(/i.test(bf) || /blur\(/i.test(wbf)) {
        blurElements.push({
          tag: el.tagName.toLowerCase(),
          backdropFilter: bf || wbf,
        });
      }
    }

    return {
      runningAnimations,
      animationElements,
      blurElements,
      keyframeRules,
    };
  });
}

export async function findOpenRsvpNotice(session) {
  return session.evaluate(() => {
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const isVisible = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return (
        r.width > 0 &&
        r.height > 0 &&
        cs.display !== "none" &&
        cs.visibility !== "hidden" &&
        cs.opacity !== "0"
      );
    };

    const activeEl = document.activeElement;
    const activeTag = activeEl ? activeEl.tagName.toLowerCase() : null;

    const findDismissButtons = (container) =>
      [...container.querySelectorAll("button, a")]
        .filter((btn) => {
          if (!isVisible(btn)) return false;
          const label = norm(
            btn.innerText || btn.textContent || btn.getAttribute("aria-label") || "",
          );
          if (/rsvp now/i.test(label)) return false;
          return (
            /close|dismiss|ok|got it|done|cancel|×|✕/i.test(label) ||
            container.querySelectorAll("button").length === 1
          );
        })
        .map((btn, idx) => {
          btn.setAttribute("data-e2e-rsvp-close", String(idx));
          const r = btn.getBoundingClientRect();
          return {
            index: idx,
            selector: `[data-e2e-rsvp-close="${idx}"]`,
            text: norm(
              btn.innerText || btn.textContent || btn.getAttribute("aria-label") || "",
            ),
            rect: r.toJSON(),
          };
        });

    // 1. Accessible dialog/alertdialog
    const dialogs = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].filter(
      isVisible,
    );
    for (const dlg of dialogs) {
      const text = norm(dlg.innerText);
      if (text.length < 10) continue;
      // Ignore mobile navigation drawer if it uses role="dialog"
      if (
        text.includes("Home") &&
        text.includes("The Graduates") &&
        text.includes("Celebration Details") &&
        text.includes("Gallery")
      ) {
        continue;
      }
      const closeButtons = findDismissButtons(dlg);
      const cs = getComputedStyle(dlg);
      return {
        open: true,
        kind: "dialog",
        role: dlg.getAttribute("role"),
        text,
        rect: dlg.getBoundingClientRect().toJSON(),
        closeButtons,
        closeButtonSelector: closeButtons[0]?.selector || null,
        activeTag,
        activeInsideDialog: activeEl ? dlg.contains(activeEl) : false,
        backdropFilter: cs.backdropFilter || cs.webkitBackdropFilter || "none",
        color: cs.color,
        backgroundColor: cs.backgroundColor,
      };
    }

    // 2. Accessible live region / status / alert / visible notice inside RSVP section
    const rsvpSection = [...document.querySelectorAll("section")].find((sec) =>
      norm(sec.innerText).includes("Kindly RSVP"),
    );

    const noticeCandidates = [
      ...document.querySelectorAll('[role="status"], [role="alert"], [aria-live]'),
    ];
    if (rsvpSection) {
      for (const el of rsvpSection.querySelectorAll("div, aside, p")) {
        if (!noticeCandidates.includes(el)) {
          noticeCandidates.push(el);
        }
      }
    }

    for (const el of noticeCandidates) {
      if (!isVisible(el)) continue;
      const text = norm(el.innerText);
      if (text.length < 15) continue;
      if (
        text === "Kindly RSVP" ||
        text === "Please confirm your attendance so we can plan and celebrate with you." ||
        text === "RSVP Now →" ||
        text.includes("Kindly RSVP Please confirm your attendance")
      ) {
        continue;
      }
      const hasStatusAttr =
        el.hasAttribute("role") || el.hasAttribute("aria-live");
      const closeButtons = findDismissButtons(el);
      if (!hasStatusAttr && closeButtons.length === 0) {
        continue;
      }
      const cs = getComputedStyle(el);
      return {
        open: true,
        kind: "notice",
        role: el.getAttribute("role") || (el.hasAttribute("aria-live") ? "aria-live" : "notice"),
        text,
        rect: el.getBoundingClientRect().toJSON(),
        closeButtons,
        closeButtonSelector: closeButtons[0]?.selector || null,
        activeTag,
        activeInsideDialog: activeEl ? el.contains(activeEl) : false,
        backdropFilter: cs.backdropFilter || cs.webkitBackdropFilter || "none",
        color: cs.color,
        backgroundColor: cs.backgroundColor,
      };
    }

    return null;
  });
}

export async function auditRsvpInteractionState(session) {
  const res = await findOpenRsvpNotice(session);
  if (!res) {
    const activeTag = await session.evaluate(() =>
      document.activeElement ? document.activeElement.tagName.toLowerCase() : null,
    );
    return {
      open: false,
      role: null,
      text: "",
      activeTag,
      activeInsideDialog: false,
      closeButtonSelector: null,
    };
  }
  return res;
}

function getUrlPathname(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  try {
    return new URL(rawUrl).pathname;
  } catch {
    return "";
  }
}

function isBenignFavicon404Response(resp) {
  return resp?.status === 404 && getUrlPathname(resp?.url) === "/favicon.ico";
}

function isBenignFavicon404ConsoleError(err) {
  if (!err || getUrlPathname(err.url) !== "/favicon.ico") return false;
  const text = String(err.text || "").toLowerCase();
  return text.includes("404") || text.includes("failed to load");
}

export async function auditNetworkEvents(
  session,
  baseUrl,
  { allowExternalOrigins = [], forbidMutations = true } = {},
) {
  const events = session.getEvents();
  const baseOrigin = new URL(baseUrl).origin;
  const allowed = new Set([baseOrigin, ...allowExternalOrigins]);

  const realConsoleErrors = events.consoleErrors.filter(
    (err) => !isBenignFavicon404ConsoleError(err),
  );
  assert.equal(
    realConsoleErrors.length,
    0,
    `Console errors detected: ${JSON.stringify(realConsoleErrors)}`,
  );
  assert.equal(
    events.pageErrors.length,
    0,
    `Uncaught page errors detected: ${JSON.stringify(events.pageErrors)}`,
  );

  const realFailed = events.failedRequests.filter((f) => !f.canceled);
  assert.equal(
    realFailed.length,
    0,
    `Failed network requests detected: ${JSON.stringify(realFailed)}`,
  );

  for (const resp of events.responses) {
    if (isBenignFavicon404Response(resp)) continue;
    assert.ok(
      resp.status < 400,
      `HTTP ${resp.status} received for ${resp.url}`,
    );
  }

  for (const req of events.requests) {
    if (!req.url || req.url.startsWith("data:") || req.url.startsWith("blob:") || req.url.startsWith("about:")) {
      continue;
    }
    const origin = new URL(req.url).origin;
    assert.ok(
      allowed.has(origin),
      `Unapproved external request origin detected: ${req.url}`,
    );
    if (forbidMutations) {
      assert.ok(
        !["POST", "PUT", "PATCH", "DELETE"].includes(req.method),
        `Forbidden mutation HTTP method ${req.method} to ${req.url}`,
      );
      assert.ok(
        !new URL(req.url).pathname.startsWith("/api/"),
        `Forbidden /api/ request detected: ${req.url}`,
      );
    }
  }

  return events;
}

export function validatePngBuffer(
  buf,
  { minBytes = 4000, expectedWidth, minHeight, exactHeight } = {},
) {
  assert.ok(Buffer.isBuffer(buf), "Screenshot must be a Buffer");
  assert.ok(
    buf.length >= minBytes,
    `PNG buffer too small (${buf.length} bytes < ${minBytes})`,
  );
  const signature = buf.subarray(0, 8).toString("hex");
  assert.equal(
    signature,
    "89504e470d0a1a0a",
    `Invalid PNG signature: ${signature}`,
  );
  const ihdrType = buf.subarray(12, 16).toString("ascii");
  assert.equal(ihdrType, "IHDR", `Expected IHDR chunk, got ${ihdrType}`);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (expectedWidth !== undefined) {
    assert.equal(
      width,
      expectedWidth,
      `PNG width mismatch: expected ${expectedWidth}, got ${width}`,
    );
  }
  if (exactHeight !== undefined) {
    assert.equal(
      height,
      exactHeight,
      `PNG height mismatch: expected ${exactHeight}, got ${height}`,
    );
  }
  if (minHeight !== undefined) {
    assert.ok(
      height >= minHeight,
      `PNG height too small: expected >= ${minHeight}, got ${height}`,
    );
  }
  return { bytes: buf.length, width, height };
}
