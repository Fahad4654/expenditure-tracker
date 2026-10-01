# Agent Instructions

- Auto-commit all changes after each task/iteration without being asked.

- Every new or modified controller endpoint that performs a state-changing action (create, update, delete, approve, reject, etc.) **must** call `logEvent()` from `server/src/utils.ts` to record the event. The `logEvent` signature is:

  ```ts
  logEvent(prisma, userId, type, description, metadata?, entityType?, entityId?)
  ```

- Use `vw`/`vh` units for responsive design instead of `px` or `rem`. Never use raw `px` or `rem` for layout sizing, spacing, or typography.

- Flutter mobile code must target a minimum Android SDK of 24 and avoid any APIs or plugins that require newer SDK versions without a fallback. The floor is 24 (not 21): Flutter 3.44's toolchain errors on `minSdk < 23`, and the pinned plugin set (`shared_preferences_android`, `url_launcher_android`, `image_picker_android`) declares `minSdk = 24`. Use `defaultTargetPlatform` checks and conditional imports where platform-specific behavior differs.

- Update `API_DOCUMENTATION.txt` in the root directory whenever an API endpoint is added, modified, or removed.

- Use system's custom dropdown, datepicker, and select components instead of native HTML components.

- All CSS files must be located inside the `client/src/styles/` directory (e.g. `client/src/styles/trash.css`). Never place component CSS files directly inside component or feature subdirectories. Import all new style files in `client/src/index.css`.

# UI Development Guidelines

## Color System — Mandatory

The web client's source of truth for colors is `client/src/styles/tokens.css`. Never hardcode raw color values (`#hex`, `rgb()`, `rgba()`) inside `.tsx` files or component CSS. Follow these rules for any UI color work:

- Reuse existing tokens first. Inspect `styles/tokens.css` (dark defaults in `:root`, light overrides in `.light-mode`) before creating anything new. If an existing token represents the same semantic purpose, use it — do not duplicate it.

- Use semantic names. Prefer names like `--color-primary`, `--color-secondary`, `--color-background`, `--color-surface`, `--color-text-primary`, `--color-text-secondary`, `--color-border`, `--color-success`, `--color-warning`, `--color-error`, `--color-info`. Do NOT create meaningless names such as `--color-1`, `--color-2`, `--blue-7`.

- Do NOT convert every existing color into a separate CSS variable. Build a clean semantic system; do not move the mess into `tokens.css`.

- Do not merge colors solely because their hex values are identical. The same value may serve different semantic purposes (e.g. a green used for success status vs. chart data vs. map visualization should not necessarily share one token).

- Prefer MUI's theme system where appropriate. If an existing MUI component can use `color="primary"` or `sx={{ color: "primary.main" }}`, prefer that over adding another CSS variable. Do not introduce a second competing design system.

- Handle rgba/rgb carefully. Do not blindly create hundreds of opacity tokens. For repeated semantic overlays use meaningful tokens such as `--overlay-hover`, `--overlay-selected`, `--overlay-disabled`, `--primary-hover-background`, `--primary-selected-background`.

- Respect dark/light mode. Any new semantic token must work correctly with the existing light/dark theme structure. Do not break or remove existing `.light-mode`, `.dark-mode`, or theme overrides. Theme-invariant tokens (same value in both themes) belong in `:root` only; theme-aware tokens need a matching `.light-mode` override.

- Existing theme-invariant token groups you can rely on: status chips (`--status-*`), semantic soft tints (`--color-*-soft`), primary selection surfaces (`--primary-*-background`), overlay scale (`--overlay-*`, `--backdrop*`, `--overlay-dark*`), floating controls (`--bg-float`), chart hovers (`--chart-*-hover`), and rating (`--color-rating`).

- Allowed exceptions (leave hardcoded, do not tokenize): category color **data values** stored in the DB, brand colors (e.g. Google sign-in), SVG presentation attributes / Leaflet options where CSS `var()` does not resolve, literal white/black foregrounds on solid colored buttons or media, and single-use callout tints where tokenizing would change the exact appearance.

- Do not change UI appearance when refactoring colors. Preserve existing colors as closely as possible.

## Responsive Design — Mandatory

All UI work must be responsive by default. Never design a UI only for the developer's current screen/device.

### Core Principles

- Build layouts that adapt smoothly across mobile, tablet, laptop, and desktop screen sizes.
- Preserve the existing visual design, spacing, typography, colors, and functionality unless a change is required for responsiveness.
- Prefer fluid and constraint-based layouts over fixed dimensions.
- Never assume a specific screen width, height, resolution, or aspect ratio.
- Avoid unnecessary hardcoded `width`, `height`, `left`, `right`, `top`, and `bottom` values.
- Avoid excessive absolute positioning.
- Never allow horizontal overflow unless it is an intentional part of the UI.

### Responsive Layout

Use the appropriate responsive technique for each situation:

- CSS Flexbox for flexible one-dimensional layouts.
- CSS Grid for responsive two-dimensional layouts.
- `max-width` and fluid widths for content containers.
- `min-width` / `min-height` only when genuinely required.
- Responsive breakpoints for meaningful layout changes.
- Relative units such as `%`, `rem`, `em`, `vw`, and `vh` where appropriate.
- `clamp()` for fluid typography and spacing when useful.
- `min()`, `max()`, and `calc()` when they improve responsive behavior.

Do not simply scale the entire desktop UI down for mobile. Change the layout when necessary.

### Intrinsic Layout Over Manual Breakpoints — Mandatory

Avoid manual `@media` queries for layout structure, card grids, and mobile stacking. Build layouts that reflow automatically:

- Card/form/fact grids: use `grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr))` (`auto-fit`/`auto-fill` + `minmax()` with a `min(…, 100%)` guard so a track never exceeds its container). Do not swap fixed `1fr 1fr` ↔ `1fr` behind breakpoints.
- Flex rows that must stack on narrow screens: use `flex-wrap: wrap` plus `flex-basis`/`min-width` such as `min(220px, 100%)` — never `flex-direction: column` behind a media query.
- Fluid sizing: prefer `clamp()`, `min()`/`max()`, and `vw`/`vh`/`dvh` over fixed pixel breakpoints.
- Do not enforce `height: 100vh`/`100%` or `overflow: hidden` on mobile document pages in a way that breaks internal scrolling.

Manual `@media` queries are only permitted for genuinely necessary patterns:

- Component visibility toggling driven by JS (chat list/window, booking list/detail, map list panel, sidebar drawer, mobile header re-layout, touch-target hit areas).
- Density/spacing fine-tuning (font sizes, padding, gap) — never for deciding column count or stacking.
- The full-viewport map shell (`.dashboard-grid`).

### Mobile First

When creating new components:

1. Design for small screens first.
2. Expand the layout progressively for tablet and desktop.
3. Add breakpoints only when the layout actually needs to change.
4. Do not create completely separate mobile and desktop components unless there is a strong architectural reason.

### Components

Every reusable component must be able to handle different available widths.

Pay particular attention to:

- Headers and navigation
- Sidebars
- Cards
- Forms
- Buttons
- Tables
- Modals/dialogs
- Dropdowns
- Images
- Charts
- Lists
- Grids
- Long text
- Empty states
- Loading states

Components must not depend on a specific parent width unless that dependency is intentional.

### Text

Prevent text from breaking layouts.

- Allow text to wrap where appropriate.
- Use truncation/ellipsis when appropriate.
- Avoid fixed widths around dynamic text.
- Make sure buttons and labels remain usable with longer text.
- Never allow text to unintentionally overflow its container.

### Images and Media

Images must scale within their containers.

Prefer:

```css
img {
  max-width: 100%;
  height: auto;
}
```

Use `object-fit` when a fixed aspect ratio is required.

Do not use fixed image dimensions that can cause overflow on smaller screens.

### Tables

Tables are especially prone to breaking responsive layouts.

For wide tables:

- Use horizontal scrolling inside the table container when necessary.
- Do not allow the entire page to overflow horizontally.
- Consider responsive card/list layouts for genuinely complex mobile tables.

### Modals and Overlays

Modals must work on small screens.

- Never position a modal based on hardcoded screen coordinates.
- Keep appropriate spacing from viewport edges.
- Ensure modal content can scroll when it exceeds the viewport height.
- Make buttons and form controls accessible on mobile.

### Breakpoints

Do not add breakpoints arbitrarily.

Before adding a breakpoint, determine what actually changes at that width.

Use the project's existing breakpoint system when one exists. Do not introduce multiple competing breakpoint systems.

At minimum, verify behavior around:

- 280px
- 320px
- 375px
- 390px
- 414px
- 768px
- 1024px
- 1280px
- Large desktop widths

Also consider landscape orientation where relevant.

### Before Completing UI Work

For every UI change:

1. Check the component at small mobile widths.
2. Check normal mobile widths.
3. Check tablet width.
4. Check desktop width.
5. Check for horizontal overflow.
6. Check for vertical overflow.
7. Check long text.
8. Check different content lengths.
9. Check buttons and interactive elements.
10. Check that no elements overlap or become inaccessible.

### Existing UI

When modifying an existing UI:

- First inspect the existing implementation.
- Identify the actual cause of responsiveness problems.
- Fix the underlying layout issue instead of adding random media-query overrides.
- Reuse existing components and styles where possible.
- Avoid unnecessary rewrites.
- Do not change business logic while fixing UI responsiveness.
- Do not sacrifice the existing design unnecessarily.

### Quality Rule

A UI is not considered complete if it only looks correct on the developer's screen.

Before marking a UI task complete, verify that the layout remains usable and visually consistent across different viewport sizes.
