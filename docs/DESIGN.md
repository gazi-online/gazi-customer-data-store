# GCDS Design System

> Canonical UI/UX Design DNA and interface guidelines for Gazi Customer Data Store.  
> Cross-references: [PRD](./PRD.md) | [Architecture](./ARCHITECTURE.md) | [Rules](./RULES.md) | [Tasks](./TASKS.md) | [Memory](./MEMORY.md)

---

## 1. Design Principles

1. **Simple & Intuitive**: Clean interfaces designed for swift, error-free customer onboarding.
2. **Clear & Legible**: High-contrast typography, unmistakable button hierarchy, and zero ambiguity on status.
3. **Operator-First**: Tailored for Indian kiosk operators processing tens or hundreds of citizens per day.
4. **Fast & Responsive**: Immediate visual response on inputs, optimistic actions, and lightweight page transitions.
5. **Mobile-Friendly**: Seamless operational parity on mobile devices (360px, 390px, 430px) as on desktop monitors.
6. **Low Cognitive Load**: Uncluttered workspaces with sensible defaults, intelligent auto-fills, and progressive disclosure.

---

## 2. Target User Experience

The primary user is a citizen service kiosk attendant, cyber cafe operator, or digital registration agent in India.
- The operator may have moderate technical proficiency and works in a busy counter environment.
- The UI must minimize data re-entry through automated OCR and address lookups.
- Errors must be caught early with plain-language inline alerts, not technical stack traces.
- Core workflows (Add Customer, Check Request Status, Record Payment, Attach Document) aspire to minimal interactions (targeting three clicks or fewer where practical), prioritizing low cognitive load, operator-first speed, and progressive disclosure.

---

## 3. Visual Hierarchy & Design Tokens

Defined in `src/app/globals.css` with Tailwind CSS v4:

### 3.1 Color Palette
- **Background**:
  - Light mode: `#F8FAFF` (soft cool slate-blue canvas)
  - Dark mode: `#090D16` / `#18181B` (`zinc-900` / `slate-950`)
- **Foreground / Text**:
  - Light mode: `#0F172A` (`slate-900`), secondary `#475569` (`slate-600`), muted `#94A3B8` (`slate-400`)
  - Dark mode: `#F8FAFC` (`slate-50`), secondary `#CBD5E1` (`slate-300`), muted `#64748B` (`slate-500`)
- **Brand / Accent**:
  - Primary: Indigo / Violet gradient (`from-violet-600 to-indigo-600`)
  - Focus Ring: Violet (`ring-violet-500`) or Blue (`ring-blue-500`)
- **Semantic Feedback**:
  - Success: Emerald (`emerald-600`, bg `emerald-50`, dark bg `emerald-950/30`)
  - Warning: Amber (`amber-600`, bg `amber-50`, dark bg `amber-950/30`)
  - Danger: Red / Rose (`red-600`, bg `red-50`, dark bg `red-950/30`)
  - Info: Blue / Sky (`blue-600`, bg `blue-50`, dark bg `blue-950/30`)

### 3.2 Motion Tokens & Keyframes
- **Timing Functions**:
  - `--ease-classic: cubic-bezier(0.22, 1, 0.36, 1)`
  - `--duration-fast: 140ms`
  - `--duration-base: 200ms`
  - `--duration-enter: 260ms`
- **Keyframe Animations**:
  - `pageEnter`: Subtle 6px upward slide with fade-in on route transition.
  - `surfaceEnter`: 4px upward slide for cards and tab panels.
  - `modalEnter`: Scale `0.985` -> `1.0` with fade for dialogs.
  - `drawerEnter`: Smooth slide from right edge.
  - `badgePop`: Micro-scale bounce for status updates.
- **Accessibility**: `@media (prefers-reduced-motion: reduce)` disables animations across all surfaces.

---

## 4. Layout & Navigation Shell

### 4.1 Desktop Shell (`md:` and above)
- **Fixed Sidebar**: 260px width with brand badge (`G` logo in violet gradient), application title ("GCDS"), and scrollable vertical navigation.
- **Top Bar**: Search bar triggering Global Command Modal (`Ctrl+K` / `Cmd+K`), quick notifications, and user account button.
- **Main Content**: Scrollable container with `p-4 sm:p-6 lg:p-8`, fluid max-width constraints, and standardized `PageHeader`.

### 4.2 Mobile Shell (below `md`)
- **Compact Top Bar**: 56px height with hamburger menu toggle, compact brand icon, and instant action trigger.
- **Off-Canvas Drawer**: Full height slide-out navigation overlay with semi-transparent backdrop (`bg-black/50 backdrop-blur-xs`).
- **Touch-Optimized Close**: Minimum 44px tap target close button (`X` icon).

---

## 5. UI Components & Patterns

### 5.1 PageHeader (`src/components/ui/PageHeader.tsx`)
Standardized header across all desks:
- Title (`text-2xl font-bold text-slate-900 dark:text-white`)
- Subtitle / context description (`text-sm text-slate-500 dark:text-slate-400 mt-1`)
- Action slot for primary buttons (e.g., "Add Customer", "New Request")

### 5.2 Cards & Surfaces
- Rounded corners: `rounded-xl` (12px) or `rounded-2xl` (16px).
- Borders: `border border-slate-200/80 dark:border-zinc-800`.
- Shadows: Soft, low-contrast shadows (`shadow-xs` or `shadow-sm`).
- Internal padding: `p-4 sm:p-6`.

### 5.3 Forms & Inputs
- **Inputs**: `w-full p-2.5 text-sm border rounded-lg bg-transparent transition-shadow`
  - Light mode: `border-zinc-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500`
  - Dark mode: `border-zinc-700 text-white focus:ring-blue-400`
- **Labels**: `text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5`
- **Required Indicator**: `<span className="text-red-500">*</span>`
- **Helper Text**: `text-xs text-zinc-400 dark:text-zinc-500 mt-1`
- **Error Messages**: `text-xs text-red-500 mt-1 font-medium`

### 5.4 Buttons
- **Primary**: `bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg shadow-xs transition-colors min-h-[40px] flex items-center justify-center gap-2`
- **Secondary**: `bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 px-4 py-2 rounded-lg`
- **Destructive**: `bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded-lg`
- **Ghost / Action**: `hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 p-2 rounded-lg`

### 5.5 Status Badges
- Standardized pill shape: `px-2.5 py-0.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5`
- Status styling:
  - *Completed / Paid / Active*: `bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300`
  - *Pending / Submitted / Draft*: `bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300`
  - *In Process / Ready*: `bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300`
  - *Action Required / Overdue*: `bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300`
  - *Rejected / Cancelled / Voided*: `bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300`
  - *Archived / Waived*: `bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400`

### 5.6 Feedback, Empty & Loading States
- **Toasts**: Handled via `sonner` (`toast.success()`, `toast.error()`, `toast.warning()`).
- **Loading Skeleton**: Route-level loading via `RouteLoadingSkeleton` (`src/components/ui/RouteLoadingSkeleton.tsx`) preserving layout dimensions during data retrieval.
- **Empty States**: Rendered via `EmptyState` (`src/components/ui/EmptyState.tsx`) featuring an illustrative icon, title, description, and primary call-to-action button.
- **Inline Error State**: `InlineErrorState` (`src/components/ui/InlineErrorState.tsx`) with retry action trigger.

---

## 6. Customer Form Design

Implemented in `src/components/forms/CustomerForm.tsx`:

### 6.1 Section Groupings
1. **Name & Basic Details**:
   - Customer Photo preview & upload (supports JPG, PNG, max 5MB).
   - Customer Code (full-width on separate row to avoid clashing with name fields).
   - Structured Name Trio: `First Name *`, `Middle Name (optional)`, `Last Name *` in equal 3-column desktop layout.
   - Native Script Row: `Name in Native Language (বাংলা / हिंदी / অন্য ভাষায় নাম)` with Bengali example placeholder `e.g. রাহুল কুমার শর্মা`, `lang="bn"`, and `spellCheck={false}`.
   - Date of Birth & Gender dropdown.
   - Family fields: Father/Guardian Name, Mother Name, Marital Status, and conditional Spouse Name.
2. **Identity & Tax Details (India)**:
   - 4-column responsive grid: Aadhaar Number, PAN Number (uppercase), Voter ID (EPIC), and GST Number.
3. **Address & Contact Details**:
   - Street Address / Premise details.
   - Indian Pincode input with automated postal lookup: auto-fills Post Office, District, and State.
   - Phone Number (starts with international calling code, hyphen, at least 4 digits, e.g., +91-9876543210) and optional WhatsApp Number.
   - Email Address.
   - Customer Status (`active`, `inactive`, `lead`).

---

## 7. Smart Import UX

Implemented in `src/components/AiSmartImportEngine/`:

### 7.1 Canonical Mental Model
```text
[ Upload Documents ] ──▶ [ Check Details ] ──▶ [ Save Customer ]
```
- Clear stage indicator in the header allows one-click switching between `Upload Documents`, `Check Details`, and `Enter Manually`.
- Drag-and-drop zone with animated marching ants border, supporting up to 10 files.
- Each staged item allows explicit side selection: `Front`, `Back`, `Both`, `Single`.
- Office files (`.docx`, `.xlsx`) display dedicated icons and are locked automatically to `Single`.
- Staged document extraction trigger with progress spinner and descriptive extraction messaging.
- Upon completion, the view transitions automatically to the populated `CustomerForm` with the `✓ Check Details` stage badge active.

### 7.2 Visual Feedback Banners
- **AI Data Applied Banner**: Emerald container notifying operator that fields have been populated by extraction, with a one-click dismiss button.
- **Duplicate Warnings Banner**: Amber container detailing any matched existing customer records (phone, Aadhaar, PAN) so the operator can verify before saving.

---

## 8. Mobile Responsiveness Rules

The UI must pass rigorous testing across three target mobile viewports:
1. **360px** (Compact budget smartphones):
   - Forms collapse strictly to a single column (`grid-cols-1`).
   - Padding compresses to `p-3` or `p-4`.
   - Modals and drawers stretch to full screen width.
   - Zero horizontal scrollbars (`overflow-x-hidden` on outer shell).
2. **390px** (Mainstream modern smartphones):
   - Standard 1-column layouts with relaxed padding (`p-4`).
   - Full tap target spacing (minimum 8px gap between buttons).
3. **430px** (Large smartphones / Phablets):
   - Opportunity for 2-column secondary groupings where appropriate.
   - Generous touch targets.

**General Mobile Rules**:
- Minimum tap target size: 44px x 44px for all buttons and interactive controls.
- Dropdowns and date pickers must use native mobile controls on touch devices.
- Tables must feature card-view fallback or contained horizontal scrolling with gradient edge indicators.

---

## 9. Progressive Disclosure

- Normal daily operations (intake, billing, status updates) must present a clean, distraction-free interface.
- Raw JSON extraction payloads, provider response metadata, and low-level OCR tokens must be tucked into secondary tabs (e.g., the JSON Import tab) and never clutter the frontline operator view.

---

## 10. Dark Mode Support

- All surfaces, modals, drawers, badges, and forms support dark mode via Tailwind's `dark:` variant.
- Inputs in dark mode switch to `dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100`.
- Text contrast strictly satisfies WCAG AA criteria across both light and dark themes.

---

## 11. Design Anti-Patterns (Prohibited in GCDS)

1. **No Technical Jargon**: Use "Check Details" instead of "Reconcile Extraction Payload"; use "Save Customer" instead of "Persist Entity".
2. **No Tiny Text**: Body text must never be smaller than 14px (`text-sm`), and helper text must never be smaller than 12px (`text-xs`).
3. **No Hidden Critical Actions**: Primary actions (Save, Submit, Print, Record Payment) must be immediately visible without scrolling through multiple menus.
4. **No Unconfirmed Destructive Actions**: Voiding payments, deleting customers, or cancelling requests must always trigger a confirmation modal.
5. **No Fake Progress Indicators**: Never display fake animated percentages for multi-step AI extractions; use indeterminate spinners with descriptive step labels instead.
6. **No Horizontal Form Overflow**: Form inputs and badges must never cause horizontal scrolling on mobile viewports.
