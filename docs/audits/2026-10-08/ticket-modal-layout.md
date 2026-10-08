# Ticket modal workspace redesign

The resolution component previously rendered after the closing tag of
`ticket-workspace-split`. The grid still reserved its resolution column and hid
the context panel, leaving an empty right side and placing resolution below
the case details.

The modal now uses a dedicated CSS Module and a single workspace grid. Case
content, collapsed context, and expanded resolution are actual grid children.
The context and resolution panels render mutually exclusively.

- At modal widths of 900px or more, case content occupies column one and either
  context or resolution occupies column two. Both states use the same column
  proportions, preserving the case column's width.
- Below 900px, the layout stacks. Open resolution appears before the long case
  content and receives focus; opening it scrolls its controls into view.
- Activity and related tickets use the full width when resolution is closed;
  they share the same split when resolution remains open.
- The redesigned shell includes a compact masthead, sticky section navigation,
  clear resolution toggle, consistent fact grid and section surfaces, continuous
  context panel, and wrapping footer actions.
- The modal owns vertical scrolling. Resolution has no forced viewport height
  or competing inner scroll region. Closing it returns focus to its toggle.
- Resolution access, data callbacks, ticket editing, and mutation permissions
  are unchanged.

Validation: TypeScript AST checks confirmed context and resolution belong inside
the workspace and outside the case-content wrapper. The CSS Module parsed
successfully. Type checking, targeted ESLint, production build, and diff checks
were run. Live signed-in visual review could not be completed: no browser
provider was available and native Chrome reported ongoing user interaction.
Desktop, mobile, and theme screenshots remain unverified.
