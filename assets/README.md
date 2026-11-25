# Project Asset Directory

## Majala & Florence Graduation & Thanksgiving Invitation Website

Welcome to the centralized asset repository for the Majala & Florence Graduation & Thanksgiving Invitation project. This directory organizes all visual, photographic, decorative, and textured assets in accordance with Phase 1 project preparation guidelines.

---

## Directory Architecture

```
assets/
├── originals/              # Untouched, pristine original source files (all 37 assets preserved)
├── photography/            # Client portrait photography
│   ├── twins/              # Dual portraits featuring both graduates together
│   ├── majala/             # Individual portraits of Majala Mwaila (populated upon verification)
│   ├── florence/           # Individual portraits of Florence Achala Mwaila (populated upon verification)
│   └── review/             # Unassigned individual portraits pending client graduate verification
├── botanical/              # Flora and botanical elements (Magnolia, Eucalyptus, Olive)
│   ├── magnolia/           # Magnolia blooms, branches, petals, and floral studies
│   ├── eucalyptus/         # Eucalyptus leaves, sprigs, and branches
│   ├── olive/              # Olive branches, leaves, and fruit illustrations
│   └── bouquets/           # Composite botanical arrangements and mixed arrangements
├── graduation/             # Academic, commencement, and ceremony graphics
│   ├── caps/               # Mortarboards and cap illustrations
│   ├── diplomas/           # Rolled parchment scrolls and degree certificates
│   ├── laurels/            # Laurel seals, wreaths, and academic medallions
│   ├── emblems/            # Crests, achievement stars, and formal symbols
│   └── ornaments/          # Composite graduation stationery, envelopes, and invitations
├── decorative/             # Stationery frames, dividers, and accents
│   ├── corners/            # Botanical corner ornaments and brackets
│   ├── frames/             # Circular and editorial rectangular portrait frames
│   ├── dividers/           # Horizontal separators and flourish dividers
│   ├── flourishes/         # Fine filigree and stationery flourishes
│   └── ribbons/            # Satin ribbon bows and ornamental ties
├── textures/               # Full-bleed tactile surface backgrounds
│   ├── ivory/              # Warm ivory paper and canvas textures
│   ├── parchment/          # Aged antique parchment and vellum textures
│   ├── sage/               # Pale sage green watercolor paper textures
│   └── champagne/          # Shimmering champagne gold paper textures
└── inventory/              # Master catalog and quality inspection documentation
    └── ASSET-INVENTORY.md  # Complete tabular register of all 37 assets with technical specifications
```

---

## File Handling & Preservation Protocols

1. **Originals Preservation**: The `assets/originals/` folder contains byte-for-byte unmodified copies of all source files. No transformations, renaming, or conversions are performed on these files.
2. **Standardized Naming**: Categorized files use clean, lowercase snake_case naming that describes the asset's visual contents, orientation, and role.
3. **Transparency Protocols**: Assets with true alpha channels (RGBA) are marked `Approved`. Assets with rasterized faux checkerboard patterns are classified as `Problematic` and documented in `ASSET-INVENTORY.md` for cleanup prior to website development.
4. **Photography Review**: Individual portraits are held in `photography/review/` until client verification confirms which portrait represents Majala and which represents Florence.

---

## Asset Status Reference

- **Approved**: File verified, free of defects, and immediately usable in production.
- **Needs inspection**: File is of high quality but requires client clarification (e.g. graduate identity) or has a solid background that may need clipping depending on container layout.
- **Problematic**: File contains baked-in checkerboard backgrounds or is a lower-fidelity duplicate; requires isolation or replacement before frontend integration.

Consult [`inventory/ASSET-INVENTORY.md`](inventory/ASSET-INVENTORY.md) for full technical metadata, resolutions, file sizes, and usage recommendations.
