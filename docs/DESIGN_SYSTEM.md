# CRM Platform - Design System

## Brand Colors

### Primary Brand Color
- **Base Color**: `#005653` (Deep Teal)
- **RGB**: `rgb(0, 86, 83)`
- **Usage**: Primary brand color for buttons, active states, and key UI elements

### Logo Gradient
- **Light**: `#007a75` (Teal-700)
- **Dark**: `#003e3c` (Teal-900)
- **Gradient**: Linear gradient from `#007a75` to `#003e3c`

### Tailwind Color Mapping

#### Brand UI Elements (Use Teal)
- **Buttons (Primary)**: `bg-teal-800` / `hover:bg-teal-900`
- **Active States**: `bg-teal-100` / `text-teal-800`
- **Borders (Active)**: `border-teal-700` / `ring-teal-700`
- **Backgrounds (Subtle)**: `bg-teal-50` / `bg-teal-100`
- **Text (Brand)**: `text-teal-800` / `text-teal-900`

#### Status Indicators (Use Emerald/Green)
- **Online/Active**: `bg-emerald-500`
- **Completed**: `bg-emerald-500` / `text-emerald-700`
- **Success States**: `bg-emerald-50` / `text-emerald-700`

### Color Usage Guidelines

1. **Brand Elements**: Use teal shades (700-900) for:
   - Primary action buttons
   - Header icon active states
   - Profile menu highlights
   - Navigation active states
   - Branded UI components

2. **Status Indicators**: Use emerald/green shades for:
   - Online/offline status
   - Completed work orders
   - Success messages
   - Active connections
   - Quality scores

3. **Backgrounds**: Use light teal shades (50-200) for:
   - Page backgrounds (gradients)
   - Card backgrounds
   - Subtle highlights

### Code Constants

```typescript
// Primary brand color
const BRAND_TEAL = "rgb(0, 86, 83)";

// For legacy compatibility (update to BRAND_TEAL)
const BRAND = "rgb(0, 86, 83)";
```

### Logo Implementation

The logo uses an inline SVG with the following gradient:
- Start: `#007a75` (stop offset="0%")
- End: `#003e3c` (stop offset="100%")

See `frontend/crm-frontend/src/app/app/app-header.tsx` for implementation.

---

**Last Updated**: 2026-03-19
**Version**: 2.0 (Deep Teal Brand)
