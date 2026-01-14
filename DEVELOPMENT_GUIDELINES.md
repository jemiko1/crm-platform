# CRM Platform - Development Guidelines

This document contains guidelines and best practices for developing features in the CRM Platform. Follow these patterns to ensure consistency and maintainability.

---

## Table of Contents

1. [Modal/Popup Implementation](#modalpopup-implementation)
2. [Future Guidelines](#future-guidelines)

---

## Modal/Popup Implementation

### Overview

All modals and popups in the CRM Platform must be properly centered in the viewport and rendered using React's `createPortal` to avoid positioning issues caused by parent container styles (overflow, transforms, etc.).

### ✅ Correct Implementation Pattern

**Always use this pattern for new modals:**

```tsx
"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";

export default function YourModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // CRITICAL: Mount check for client-side rendering
  useEffect(() => {
    setMounted(true);
  }, []);

  // CRITICAL: Return null if not mounted or not open
  if (!open || !mounted) return null;

  // CRITICAL: Wrap modal content in a variable
  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div
          className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-zinc-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="border-b border-zinc-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  Modal Title
                </h2>
                <p className="mt-1 text-xs text-zinc-600">
                  Optional subtitle
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl p-2 text-zinc-600 hover:bg-zinc-100"
                aria-label="Close"
              >
                {/* Close icon */}
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Your form/content here */}
          </div>
        </div>
      </div>
    </div>
  );

  // CRITICAL: Use createPortal to render to document.body
  return createPortal(modalContent, document.body);
}
```

### Key Requirements

1. **Import `createPortal`**: Always import from `react-dom`
   ```tsx
   import { createPortal } from "react-dom";
   ```

2. **Mounted State**: Always include a `mounted` state check
   ```tsx
   const [mounted, setMounted] = useState(false);
   
   useEffect(() => {
     setMounted(true);
   }, []);
   ```

3. **Early Return**: Check both `open` and `mounted` before rendering
   ```tsx
   if (!open || !mounted) return null;
   ```

4. **Portal Structure**: Use this exact structure:
   - Outer container: `fixed inset-0 z-[9999] flex items-center justify-center p-4`
   - Backdrop: `fixed inset-0 bg-black/40 backdrop-blur-sm`
   - Modal wrapper: `relative w-full max-w-{size} max-h-[90vh] overflow-y-auto`
   - Modal content: `w-full max-w-{size} overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-zinc-200`

5. **Z-Index**: Use `z-[9999]` for the modal container to ensure it's above all other content

6. **Max Width Options**: 
   - Small: `max-w-lg` (512px)
   - Medium: `max-w-2xl` (672px)
   - Large: `max-w-4xl` (896px)

7. **Max Height**: Always use `max-h-[90vh]` to prevent overflow on small screens

8. **Scrollable Content**: Use `overflow-y-auto` on the modal wrapper for long content

9. **Final Return**: Always use `createPortal` to render to `document.body`
   ```tsx
   return createPortal(modalContent, document.body);
   ```

### ❌ Common Mistakes to Avoid

1. **Don't render modals inline** - Always use `createPortal`
2. **Don't forget the `mounted` check** - Required for SSR compatibility
3. **Don't use fragments (`<>`)** - Wrap in a single `div` for the portal
4. **Don't use relative positioning on parent** - Portal to `document.body` avoids this
5. **Don't skip the backdrop** - Always include a clickable backdrop to close
6. **Don't forget `stopPropagation`** - Prevent clicks inside modal from closing it

### Reference Implementation

See these correctly implemented modals for reference:
- `frontend/crm-frontend/src/app/modal-dialog.tsx` - Reusable modal component
- `frontend/crm-frontend/src/app/app/incidents/report-incident-modal.tsx` - Complex multi-step modal
- `frontend/crm-frontend/src/app/app/buildings/add-building-modal.tsx` - Simple form modal
- `frontend/crm-frontend/src/app/app/employees/add-employee-modal.tsx` - Form with dropdowns

### When to Use `ModalDialog` Component

For simple modals with just content, consider using the existing `ModalDialog` component:

```tsx
import ModalDialog from "../../modal-dialog";

<ModalDialog
  open={showModal}
  onClose={() => setShowModal(false)}
  title="Modal Title"
  maxWidth="2xl"
>
  {/* Your content here */}
</ModalDialog>
```

Use custom modal implementation when you need:
- Multi-step forms
- Complex layouts
- Custom header/footer behavior
- Special animations

---

## Future Guidelines

This section will be expanded with additional development guidelines as needed:

- [ ] API Endpoint Patterns
- [ ] Form Validation Patterns
- [ ] Error Handling Patterns
- [ ] Permission Checks
- [ ] Database Migration Guidelines
- [ ] Testing Patterns
- [ ] Component Organization
- [ ] Styling Conventions

---

## Notes

- Always test modals on different screen sizes
- Ensure modals are accessible (keyboard navigation, focus management)
- Consider mobile responsiveness when setting max-widths
- Test with long content to ensure scrolling works correctly

---

**Last Updated**: 2025-01-15
**Maintained By**: Development Team
