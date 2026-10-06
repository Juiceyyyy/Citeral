# Citeral UI Design System

## Product character
Citeral should feel calm, precise, private, and inspectable. The interface is a professional knowledge workspace, not an AI demo. Visual decisions should support reading, source inspection, configuration, and long chat sessions without competing with the work.

## Reference direction
Framer is used as an inspiration board for restraint, typography, information hierarchy, product-in-context presentation, and responsive polish. Do not copy Framer branding, logos, layouts, or signature assets. Citeral keeps its own evidence-blue accent and product identity.

## Visual rules
- Dark neutral canvas; avoid ambient radial gradients, glassmorphism, decorative glows, and glossy UI.
- One primary accent: evidence blue. Use it for primary actions, active controls, links, and focus—not decoration.
- Two meaningful surface levels plus the page canvas. Do not wrap every concept in a card.
- 8px spacing rhythm. Default control radius 8px; grouped surfaces 12–14px; large marketing containers at most 16px.
- Borders are hairlines used to explain grouping. Shadows are rare and shallow.
- Body text is neutral and readable; headings use tighter tracking rather than oversized weight.
- Prefer section hierarchy, separators, and whitespace to nested boxes.
- Status colors are semantic only: green ready/success, amber processing/warning, red failure/destructive.

## Interaction rules
- Standard controls target at least 40px high; primary auth/mobile controls 44px where practical.
- Hover feedback should be subtle and finish around 160ms.
- Do not animate layout for decoration. Respect `prefers-reduced-motion`.
- Always provide visible keyboard focus.
- Empty states explain the next action rather than filling space with illustration.
- Destructive actions remain visually quiet until the user reaches the relevant context.

## Chat
- Assistant messages are unboxed and optimized for reading.
- User messages use one quiet light bubble for fast scanning.
- Composer is a single integrated surface for text, uploads, send/stop, and attachment state.
- Starter prompts are task cards, not decorative chips.
- Assistant identity and jurisdiction live in the chat header without dominating it.
- Source links are compact evidence controls and should never look like promotional CTAs.

## Responsive behavior
- Desktop uses a persistent collapsible navigation rail.
- Mobile uses a compact top bar and modal navigation drawer.
- Tables may scroll horizontally when the data model cannot be responsibly collapsed.
- Multi-column marketing and settings layouts collapse to one column before text or controls become cramped.

## Accessibility floor
- WCAG 2.2 AA contrast targets for text and controls.
- Semantic labels on fields and icon buttons.
- 44px recommended touch targets for key mobile actions; never below 24px.
- No meaning conveyed by color alone.
- Text must remain usable at 200% zoom.
