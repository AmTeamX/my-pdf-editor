# PDF Audit Tool — Design System

## Brand

**Genre:** Professional / Data-dense  
**Tone:** Confident, precise, trustworthy  

## Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--color-bg` | `#0f1117` | Page background |
| `--color-surface` | `#1a1d27` | Cards, sidebars |
| `--color-surface2` | `#242836` | Hover states, secondary surfaces |
| `--color-border` | `#2a3040` | Dividers, borders |
| `--color-text` | `#e4e6ed` | Primary text |
| `--color-text2` | `#8b8fa5` | Secondary text, labels |
| `--color-accent` | `#3b82f6` | Primary actions, focus |
| `--color-red` | `#ef4444` | Critical findings, errors |
| `--color-orange` | `#f59e0b` | Warnings, flags |
| `--color-yellow` | `#eab308` | Notes, observations |
| `--color-green` | `#22c55e` | Success, verified |

## Highlight Semantics

| Color | Hex | Use Case |
|-------|-----|----------|
| 🔴 Red | `rgba(255,0,0,0.3)` | Critical risk, security issue, violation |
| 🟠 Orange | `rgba(255,165,0,0.35)` | Flag, requires attention, compliance gap |
| 🟡 Yellow | `rgba(255,255,0,0.4)` | Note, observation, inconsistency |
| 🔵 Blue | `rgba(59,130,246,0.25)` | Info, verification item, data point |

## Typography

- **Primary:** System UI (SF Pro / Segoe UI / Roboto)
- **Mono:** JetBrains Mono (code, IDs)
- **Scale:** 12px (captions) → 14px (body) → 16px (headings) → 24px (titles)

## Layout

- **Sidebar width:** 180px (thumbnails) + 300px (findings)
- **Max content width:** 900px (file manager)
- **Card radius:** 8px
- **Button radius:** 6px

## Components

### File Card
- Surface background, 1px border
- 3 action buttons: Convert / Open / Delete
- Status indicator: "✓ Converted" or "Not converted"

### PDF Viewer
- Center-aligned, scrollable
- Highlight overlay with color + border on selection
- Page thumbnails in left sidebar

### Findings Panel
- Right sidebar, scrollable
- Color-coded left border per highlight
- Inline comments below each finding
- Click to navigate to page

## Interactions

- Highlight click → scrolls to page + positions highlight in view
- Text selection → creates new highlight immediately
- Save button → persists all highlights to API
- Page thumbnail click → navigates

## States

- **Loading:** Centered text "Loading PDF..."
- **Empty:** "No findings" / "Select text to highlight"
- **Error:** Red banner with message
- **Success:** Green toast "Highlights saved!"
