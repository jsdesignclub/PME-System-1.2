Create a high-fidelity, production-ready modernization of the attached Enterprise Management System dashboard screenshot.

Use the attached screenshot as the primary reference for the application’s information architecture, content hierarchy, navigation structure, chart placement, labels, and metric values. Preserve the functional structure of the original interface, but completely redesign its visual presentation using a premium dark-mode corporate technology aesthetic.

The result should feel like a modern government enterprise platform designed in 2025: professional, trustworthy, data-focused, accessible, and visually refined.

TECHNOLOGY STACK

Build the interface using:

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui for accessible interface primitives
- Lucide React for consistent icons
- Recharts for production-quality data visualizations
- Framer Motion for restrained interface animations
- Radix UI primitives where needed for tooltips, menus, dialogs, and accessible interactions

Do not use placeholder icon characters, emojis, or hand-drawn graphics. Use modern vector icons from Lucide React.

REFERENCE SCREENSHOT REQUIREMENTS

Use the attached screenshot as the structural reference.

Preserve these primary areas:

1. Top application header
2. Ministry and product branding
3. User profile and administrator role
4. Language selector
5. Notification control
6. Collapsible left navigation sidebar
7. Dashboard navigation state
8. “Coming Later” disabled modules
9. Four summary metric cards
10. Large workflow-state visualization
11. Priority visualization
12. Sender-type visualization

Preserve the original labels and values:

- Letters on Record: 1
- Open: 1
- Completed: 0
- Overdue: 0
- Workflow State: In Progress, 1 letter, 100%
- Priority: Urgent, 1 letter
- Sender Type: Government Office, 1

Do not replace the application with an unrelated generic analytics dashboard. It must remain recognizable as a redesigned version of the attached Enterprise Management System.

VISUAL DIRECTION

Design a sophisticated dark enterprise dashboard with the following qualities:

- Clean and minimalist
- Premium corporate technology aesthetic
- Strong visual hierarchy
- Subtle depth and directional lighting
- High-quality data visualization
- Generous but efficient spacing
- Crisp typography
- Soft borders and restrained glass effects
- Professional rather than futuristic or gaming-oriented
- Suitable for a government administrative system

Present the application inside a refined dark browser-style frame. Include a small centered tab labeled “React/Vite App,” subtle browser controls, and a production-status indicator.

Avoid excessive gradients, oversized text, heavy neon effects, or distracting decorative elements.

COLOR PALETTE

Use a consistent token-based color system.

Application background:
- Deep navy-black: #050714
- Secondary background: #080A17

Primary surfaces:
- Main surface: #0A0D1A
- Raised surface: #111526
- Soft surface: #161A2F

Borders:
- Default border: rgba(148, 163, 184, 0.12)
- Emphasized border: rgba(148, 163, 184, 0.20)

Typography:
- Primary text: #F3F5FB
- Secondary text: #A5AEC2
- Muted text: #667089

Brand and chart accents:
- Electric purple: #7357ED
- Bright purple: #A084FF
- Corporate blue: #4F8CFF
- Success green: #39D6A3
- Warning amber: #F6B94C
- Critical red: #FF6375

Use electric purple as the primary interactive accent. Use blue for secondary data, green for success and operational states, amber for warnings, and red only for critical or overdue states.

TYPOGRAPHY

Use:

- DM Sans or Inter for interface text
- JetBrains Mono for numerical values, chart figures, statuses, and technical metadata

Typography should be compact and highly legible.

Use:

- Small uppercase labels with increased letter spacing for section eyebrows
- Medium-weight panel headings
- Large tabular numerals for important metrics
- Muted supporting descriptions
- Clear contrast between titles, labels, values, and metadata

APPLICATION FRAME

Place the dashboard inside a large, rounded application window with:

- A subtle one-pixel border
- Soft outer shadow
- Slight inner highlight
- Dark browser chrome
- Three small window controls
- A centered “React/Vite App” tab
- A “Production” status indicator with an animated green dot

Keep the browser treatment subtle so it does not compete with the actual application.

LEFT SIDEBAR

Create a dark vertical navigation sidebar.

At the top, include:

- A compact ministry shield or institutional icon
- “Ministry of Sport”
- “Uva Province”

Add a collapse control below the brand area.

Main navigation items:

- Dashboard
- Letter Registry
- Officers
- Administration

The Dashboard item should be active and use:

- A subtle purple-to-blue tinted background
- A slim illuminated purple indicator
- Bright text
- A Lucide dashboard icon

Add a “Coming Later” section containing:

- Vehicles — Phase 6
- Staff Transfers — Phase 7
- Inventory — Phase 8

These items should appear disabled or muted but remain legible.

At the bottom of the sidebar, include:

- Animated green operational indicator
- “System online”
- “All services operational”

When the sidebar is collapsed:

- Show icons only
- Preserve tooltips
- Rotate the collapse icon
- Animate the width smoothly
- Keep the active-state indicator visible

TOP HEADER

Create a compact application header containing:

Left side:
- “Enterprise Management System”
- Breadcrumb: Workspace / Dashboard

Right side:
- Sinhala language selector
- Notification control with unread indicator
- User avatar with initials “JP”
- User name: Jayasena Palihakoon
- Role: System administrator
- Administrator role badge

Use accessible dropdown menus for language, notifications, and user profile actions.

DASHBOARD HEADING

Add a dashboard introduction section:

Eyebrow:
- Overview

Title:
- Dashboard

Description:
- Monitor correspondence and workflow performance in real time.

On the right, display:

- Animated green status dot
- “Updated just now”

SUMMARY METRIC CARDS

Create four uniform summary cards in one responsive row.

Card 1:
- Label: Letters on Record
- Value: 1
- Supporting text: Total registered
- Lucide copy or documents icon
- Purple accent

Card 2:
- Label: Open
- Value: 1
- Supporting text: Awaiting action
- Lucide folder icon
- Blue accent

Card 3:
- Label: Completed
- Value: 0
- Supporting text: No completed letters
- Lucide circle-check icon
- Green accent

Card 4:
- Label: Overdue
- Value: 0
- Supporting text: All clear
- Lucide alert-triangle icon
- Red accent used subtly

Each card should include:

- A small tinted icon container
- Uppercase metric label
- Large monospaced number
- Supporting description
- Subtle accent glow
- One-pixel border
- Soft elevated shadow
- Hover elevation and border transition
- Count-up animation when the page loads

WORKFLOW STATE PANEL

Create a large card titled:

- By Workflow State

Subtitle:

- Select a state to filter the letter registry

Include a small “1 total” badge.

Use a modern animated donut chart representing:

- In Progress: 1
- Percentage: 100%

The donut chart should use a purple-to-blue gradient and include:

- Soft glow
- Animated circular progress on initial load
- A small highlighted point on the ring
- Center value: 1
- Center label: Letter
- Center percentage: 100%

Beside the donut, include:

- Purple legend dot
- “In Progress”
- Value: 1
- Full-width gradient progress bar
- “All registered letters”
- “100%”

Add a small positive insight panel:

- “Current workload is healthy”
- “No overdue actions detected”

Use a green trend icon and a restrained success-state background.

The chart should support hover tooltips and selection. Selecting the workflow state should visually highlight the corresponding legend row.

PRIORITY PANEL

Create a panel titled:

- By Priority

Subtitle:

- Letter distribution by urgency level

Include a small “Live” badge.

Create a clean priority chart with:

- Y-axis values from 0 to 4
- Urgent category on the X-axis
- One data point at value 1
- Subtle dashed grid lines
- A red vertical guide
- A glowing red data point
- A restrained pulsing ring around the point

Below the chart, display:

- Red legend dot
- Urgent
- 1 letter
- “Action required” status badge

Use red only for the urgent point and its related status elements.

SENDER TYPE PANEL

Create a panel titled:

- By Sender Type

Subtitle:

- Organizations currently sending correspondence

Include a “1 source” badge.

Create a horizontal bar chart containing:

- Government Office: 1
- X-axis range: 0 to 4

Use:

- Purple-to-blue gradient bar
- Soft glow
- Rounded corners
- Animated bar growth
- Clear numeric value at the end of the bar
- Subtle vertical grid divisions
- Tooltip on hover

COMPONENT SYSTEM

Create reusable components for:

- Application frame
- Sidebar
- Navigation item
- Header
- Profile menu
- Metric card
- Chart panel
- Status badge
- Animated status dot
- Workflow donut chart
- Priority chart
- Sender-type chart
- Tooltip
- Empty state
- Loading skeleton

Do not create one oversized component containing the entire page.

Use shared tokens for:

- Colors
- Spacing
- Border radius
- Shadows
- Typography
- Chart colors
- Animation duration
- Focus states

ANIMATION AND INTERACTION

Use Framer Motion for smooth, professional animation.

Include:

- Short staggered entrance animation for metric cards
- Animated donut progress on page load
- Horizontal bar growth animation
- Count-up animation for metric values
- Pulsing operational status dot
- Pulsing urgent-priority point
- Smooth sidebar collapse and expansion
- Subtle hover elevation on cards
- Animated active navigation indicator
- Tooltip fade and scale transitions
- Smooth chart transitions when filters change
- Skeleton loading state before data appears

Animation constraints:

- Keep animations between 150ms and 500ms for standard interactions
- Use spring animation only for small navigational elements
- Avoid continuous decorative motion except status indicators
- Avoid exaggerated bounce effects
- Respect prefers-reduced-motion
- Do not allow animation to reduce readability

ACCESSIBILITY

Follow WCAG AA standards.

Include:

- Strong text contrast
- Visible keyboard focus indicators
- Semantic landmarks
- Accessible buttons
- Keyboard-operable menus
- Proper ARIA labels for charts and icon-only controls
- Tooltips for collapsed navigation items
- Non-color indicators for status
- Reduced-motion support
- Minimum practical interaction target sizes
- Screen-reader-friendly chart summaries

RESPONSIVE BEHAVIOR

Desktop:
- Full sidebar
- Four metric cards in one row
- Workflow panel on the left
- Priority and sender panels stacked on the right

Tablet:
- Sidebar collapses to icons
- Analytics panels may stack
- Metric cards use a two-column grid

Mobile:
- Replace the permanent sidebar with a drawer
- Use a compact header
- Display metric cards in one or two columns
- Stack all charts vertically
- Preserve chart readability
- Avoid horizontal page scrolling
- Keep labels and tooltips accessible

QUALITY REQUIREMENTS

The final result must:

- Closely preserve the attached screenshot’s content and layout
- Look substantially more modern and polished
- Be fully responsive
- Use real charts rather than static image approximations
- Use reusable production-quality components
- Avoid placeholder text
- Avoid random or unrelated metrics
- Avoid excessive glassmorphism
- Avoid oversaturated neon styling
- Avoid emojis
- Avoid inconsistent icon styles
- Avoid generic template appearance
- Include realistic hover, focus, loading, and empty states
- Feel cohesive, deliberate, and suitable for a professional government enterprise application

DELIVERABLE

Produce a complete, functional React dashboard implementation with:

- All required components
- Responsive styling
- Chart configurations
- Animation behavior
- Accessibility attributes
- Mock data matching the attached screenshot
- Clean TypeScript types
- Maintainable file structure
- No unfinished placeholders or TODO sections

The final dashboard should look like a premium modernization of the attached Enterprise Management System rather than an entirely different product.