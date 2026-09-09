---
name: GCDS Design System
colors:
  surface: '#ffffff'
  surface-dim: '#f1f5f9'
  surface-bright: '#ffffff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f8fafc'
  surface-container: '#f1f5f9'
  surface-container-high: '#e2e8f0'
  surface-container-highest: '#cbd5e1'
  on-surface: '#0f172a'
  on-surface-variant: '#475569'
  inverse-surface: '#0f172a'
  inverse-on-surface: '#f8fafc'
  outline: '#94a3b8'
  outline-variant: '#e2e8f0'
  surface-tint: '#6366f1'
  primary: '#6366f1'
  on-primary: '#ffffff'
  primary-container: '#eef2ff'
  on-primary-container: '#312e81'
  inverse-primary: '#a5b4fc'
  secondary: '#3b82f6'
  on-secondary: '#ffffff'
  secondary-container: '#eff6ff'
  on-secondary-container: '#1e40af'
  tertiary: '#7c3aed'
  on-tertiary: '#ffffff'
  tertiary-container: '#f5f3ff'
  on-tertiary-container: '#4c1d95'
  error: '#dc2626'
  on-error: '#ffffff'
  error-container: '#fef2f2'
  on-error-container: '#991b1b'
  primary-fixed: '#e0e7ff'
  primary-fixed-dim: '#c7d2fe'
  on-primary-fixed: '#1e1b4b'
  on-primary-fixed-variant: '#3730a3'
  secondary-fixed: '#dbeafe'
  secondary-fixed-dim: '#bfdbfe'
  on-secondary-fixed: '#172554'
  on-secondary-fixed-variant: '#1d4ed8'
  tertiary-fixed: '#ede9fe'
  tertiary-fixed-dim: '#ddd6fe'
  on-tertiary-fixed: '#2e1065'
  on-tertiary-fixed-variant: '#5b21b6'
  background: '#f8faff'
  on-background: '#0f172a'
  surface-variant: '#f8fafc'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '800'
    lineHeight: 48px
    letterSpacing: -0.025em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  headline-md-mobile:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  container-max: 1440px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 32px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style

The **Gazi Customer Data Store (GCDS)** design system is engineered for mission-critical customer data management, customer documentation, digital service delivery, invoicing, and reporting operations in India. It balances institutional reliability and security with modern, high-speed SaaS efficiency.

### Core Tenets
- **Trust & Integrity:** Clean, crisp layouts that inspire absolute confidence in data security, auditability, and data ownership.
- **Modern Minimalism:** Elimination of visual noise, over-saturated dark themes, and childish illustrations. Clean typography and generous whitespace guide cognitive focus.
- **Enterprise Precision:** High-density data tables, clear status markers, legible tabular metrics, and ergonomic forms tailored for rapid daily business workflows.

## Colors

The palette is built on a "Deep Slate" and "Near-White" foundation to provide a rich, premium feel.

- **Canvas Background:** #F8FAFF (Warm, very light near-white with subtle cool-blue undertone)
- **Surface Default (Cards & Panels):** #FFFFFF
- **Surface Alt / Inset:** #F8FAFC (Slate-50)
- **Dividers & Subdued Borders:** #E2E8F0 (Slate-200)
- **Active / Focus Borders:** #818CF8 (Indigo-400) / #6366F1 (Indigo-500)
- **Primary Brand Action:** A vibrant Indigo (#6366F1) is reserved for primary calls to action, active tabs, and progress indicators.
- **Secondary Accent:** Institutional Blue (#3B82F6) for secondary actions, badges, and hyperlinks.
- **Tertiary Accent:** Royal Violet (#7C3AED) for subtle brand highlights and premium gradients.
- **Brand Text:** Deep Navy (#0F172A) for authoritative headers, and Slate (#475569) for secondary body copy.
- **Status Colors:** Standardized semantic alerts: Green (#166534 on #F0FDF4) for verified states, Amber (#92400E on #FFFBEB) for pending review, and Red (#991B1B on #FEF2F2) for errors.

## Typography

This design system utilizes **Inter** for exceptional legibility in data-dense interfaces and clear numerical metrics.

- **Hierarchy:** Use display-lg for page-level hero headlines. headline-md is used for modal and view headers. headline-sm is the standard for card titles.
- **Labels:** Meta-information, small status tags, and form labels use label-md with uppercase styling and slight letter spacing.
- **Readability:** Paragraphs use body-md (14px) for high density and body-lg (16px) for wizard/onboarding introductions.

## Layout & Spacing

The layout follows a structured grid system tailored for enterprise dashboards and responsive portals.

- **Grid:** 12-column layout with a 1440px max container width on desktop.
- **Rhythm:** Spacing follows a 4px base unit. Card padding is generous (24px to 32px) to maintain a modern SaaS feel.
- **Mobile Adaptivity:** On viewports under 640px, the layout transitions to a fluid 1-column stack with 16px horizontal margins.

## Elevation & Depth

Visual hierarchy is established through **Tonal Layers** rather than heavy black drop shadows.

- **Level 0 (Canvas):** Clean #F8FAFF with optional subtle violet-blue radial ambient glow.
- **Level 1 (Surface Cards):** Pure white #FFFFFF with a 1px border (#E2E8F0) and 0 1px 3px rgba(0, 0, 0, 0.04) shadow.
- **Level 2 (Login Card / Elevated Panel):** Pure white with refined 1.5px border and diffused shadow (0 20px 45px rgba(99, 102, 241, 0.08)).
- **Level 3 (Modals):** Elevated dialogs with backdrop blur (4px) and soft ambient shadow.

## Shapes

The design system employs a **Rounded** corner radius:
- **Small Controls:** Inputs, buttons, and badges use 8px to 14px radius.
- **Cards & Modals:** Large cards and modals use 16px to 24px (and 32px for the hero login card wrapper).

## Components

### Buttons
- **Primary:** Gradient button (linear-gradient(135deg, #7C3AED, #6366F1, #3B82F6)) with white text and subtle hover lift.
- **Secondary:** White background with 1px border (#CBD5E1) and dark slate text.
- **Ghost:** Transparent background with subtle slate hover tint.

### Input Fields
- Floating-label fields on border with 56px height, leading icon (20px Indigo), and crisp focus ring (ring-2 ring-indigo-100).
- Explicit accessible error messages with role="alert".

### Data Tables
- White container with 1px border (#E2E8F0). Header row in #F8FAFC with uppercase 11px labels. Tabular numerals for monetary and quantity values.

### Badges
- Pill-shaped badges (rounded-full) with 6px status dot indicator.
