# List Items Management System - Design Document

**Created**: 2026-01-15
**Status**: Design Phase
**Purpose**: Allow administrators to manage all dropdown/enum values dynamically

---

## Overview

This system allows administrators to create, update, delete, and manage all list items (enums) used throughout the CRM without requiring code changes or deployments.

---

## Current Hardcoded List Items (Enums)

### User-Manageable (High Priority)

These should be configurable by administrators:

| Enum Name | Current Values | Usage | Users |
|-----------|---------------|-------|-------|
| **AssetType** | ELEVATOR, ENTRANCE_DOOR, INTERCOM, SMART_GSM_GATE, SMART_DOOR_GSM, BOOM_BARRIER, OTHER | Building products | ~1000s |
| **ContactMethod** | PHONE, EMAIL, IN_PERSON, OTHER | Incident reporting | ~1000s |
| **IncidentPriority** | LOW, MEDIUM, HIGH, CRITICAL | Incident severity | ~1000s |
| **ProductCategory** | ROUTER, CONTROLLER, SENSOR, CABLE, ACCESSORY, HARDWARE, SOFTWARE, OTHER | Inventory | ~100s |
| **ProductUnit** | PIECE, METER, KG, BOX, SET | Inventory measurements | ~100s |
| **WorkOrderType** | INSTALL, DIAGNOSTIC, REPAIR | Work order classification | ~1000s |

### System-Managed (Medium Priority)

These have business logic but could be configurable:

| Enum Name | Current Values | Usage | Can Modify? |
|-----------|---------------|-------|-------------|
| **WorkOrderStatus** | NEW, DISPATCHED, ACCEPTED, IN_PROGRESS, DONE, CANCELED | Work order lifecycle | ⚠️ Careful (state machine) |
| **IncidentStatus** | CREATED, IN_PROGRESS, COMPLETED, WORK_ORDER_INITIATED | Incident lifecycle | ⚠️ Careful (state machine) |
| **PurchaseOrderStatus** | DRAFT, ORDERED, SHIPPED, RECEIVED, CANCELLED | Purchase order lifecycle | ⚠️ Careful (state machine) |
| **StockTransactionType** | PURCHASE_IN, WORK_ORDER_OUT, ADJUSTMENT_IN, ADJUSTMENT_OUT, RETURN_IN, DAMAGED_OUT | Inventory transactions | ⚠️ Careful (accounting logic) |

### System-Only (Low Priority / Not User-Manageable)

These are core to the system and should NOT be user-editable:

| Enum Name | Usage | Reason |
|-----------|-------|--------|
| **UserRole** | ADMIN, CALL_CENTER, TECHNICIAN, WAREHOUSE, MANAGER | Legacy auth (deprecated) | Security risk |
| **EmployeeStatus** | ACTIVE, INACTIVE, ON_LEAVE, TERMINATED | Employee state | Core HR logic |
| **DeviceStatus** | ONLINE, OFFLINE, UNKNOWN | Device monitoring | Core system logic |
| **PermissionCategory** | GENERAL, BUILDINGS, CLIENTS, etc. | RBAC system | Security risk |
| **PermissionOverride** | GRANT, DENY | RBAC system | Security risk |
| **AuditAction** | CREATE, UPDATE, DELETE | Audit logging | Compliance requirement |
| **AuditEntity** | BUILDING, CLIENT, ASSET, etc. | Audit logging | System architecture |

---

## Architecture Design

### Database Schema

**New Table: `SystemListCategory`**
```prisma
model SystemListCategory {
  id          String   @id @default(uuid())
  key         String   @unique  // "ASSET_TYPE", "CONTACT_METHOD", etc.
  displayName String             // "Product Types", "Contact Methods"
  description String?
  isEditable  Boolean  @default(true)  // Can users modify this list?
  isSystem    Boolean  @default(false) // Is this a core system enum?

  items       SystemListItem[]

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

**New Table: `SystemListItem`**
```prisma
model SystemListItem {
  id          String   @id @default(uuid())
  categoryId  String
  category    SystemListCategory @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  value       String             // "ELEVATOR", "PHONE", etc.
  displayName String             // "Elevator", "Phone Call"
  description String?
  color       String?            // Optional color for UI (e.g., priority badges)
  icon        String?            // Optional icon name
  sortOrder   Int      @default(0)

  isActive    Boolean  @default(true)
  isDefault   Boolean  @default(false)
  isSystem    Boolean  @default(false)  // Cannot be deleted

  // Usage tracking
  usageCount  Int      @default(0)  // How many times this value is used
  lastUsedAt  DateTime?

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([categoryId, value])
  @@index([categoryId, isActive])
  @@index([categoryId, sortOrder])
}
```

**New Table: `SystemListItemUsage`** (for tracking and safe deletion)
```prisma
model SystemListItemUsage {
  id         String   @id @default(uuid())
  listItemId String

  entityType String   // "Asset", "Incident", "InventoryProduct", etc.
  entityId   String   // UUID of the entity using this value
  fieldName  String   // "type", "contactMethod", "category", etc.

  createdAt  DateTime @default(now())

  @@index([listItemId])
  @@index([entityType, entityId])
}
```

---

## Migration Strategy

### Phase 1: Seed System List Categories and Items

Migrate existing enums to database:

```typescript
// Seed function
async function seedSystemLists() {
  const categories = [
    {
      key: 'ASSET_TYPE',
      displayName: 'Product Types',
      description: 'Types of products/assets installed in buildings',
      isEditable: true,
      isSystem: false,
      items: [
        { value: 'ELEVATOR', displayName: 'Elevator', sortOrder: 1, isSystem: true },
        { value: 'ENTRANCE_DOOR', displayName: 'Entrance Door', sortOrder: 2, isSystem: true },
        { value: 'INTERCOM', displayName: 'Intercom', sortOrder: 3, isSystem: true },
        { value: 'SMART_GSM_GATE', displayName: 'Smart GSM Gate', sortOrder: 4, isSystem: true },
        { value: 'SMART_DOOR_GSM', displayName: 'Smart Door GSM', sortOrder: 5, isSystem: true },
        { value: 'BOOM_BARRIER', displayName: 'Boom Barrier', sortOrder: 6, isSystem: true },
        { value: 'OTHER', displayName: 'Other', sortOrder: 99, isSystem: true },
      ],
    },
    {
      key: 'CONTACT_METHOD',
      displayName: 'Contact Methods',
      description: 'How clients report incidents',
      isEditable: true,
      isSystem: false,
      items: [
        { value: 'PHONE', displayName: 'Phone Call', icon: 'phone', sortOrder: 1 },
        { value: 'EMAIL', displayName: 'Email', icon: 'mail', sortOrder: 2 },
        { value: 'IN_PERSON', displayName: 'In Person', icon: 'user', sortOrder: 3 },
        { value: 'OTHER', displayName: 'Other', sortOrder: 99 },
      ],
    },
    {
      key: 'INCIDENT_PRIORITY',
      displayName: 'Incident Priorities',
      description: 'Severity levels for incidents',
      isEditable: true,
      isSystem: false,
      items: [
        { value: 'LOW', displayName: 'Low', color: 'zinc', sortOrder: 1 },
        { value: 'MEDIUM', displayName: 'Medium', color: 'blue', sortOrder: 2 },
        { value: 'HIGH', displayName: 'High', color: 'amber', sortOrder: 3 },
        { value: 'CRITICAL', displayName: 'Critical', color: 'rose', sortOrder: 4 },
      ],
    },
    {
      key: 'PRODUCT_CATEGORY',
      displayName: 'Product Categories',
      description: 'Inventory product categories',
      isEditable: true,
      isSystem: false,
      items: [
        { value: 'ROUTER', displayName: 'Router', sortOrder: 1 },
        { value: 'CONTROLLER', displayName: 'Controller', sortOrder: 2 },
        { value: 'SENSOR', displayName: 'Sensor', sortOrder: 3 },
        { value: 'CABLE', displayName: 'Cable', sortOrder: 4 },
        { value: 'ACCESSORY', displayName: 'Accessory', sortOrder: 5 },
        { value: 'HARDWARE', displayName: 'Hardware', sortOrder: 6 },
        { value: 'SOFTWARE', displayName: 'Software', sortOrder: 7 },
        { value: 'OTHER', displayName: 'Other', sortOrder: 99 },
      ],
    },
    {
      key: 'PRODUCT_UNIT',
      displayName: 'Product Units',
      description: 'Units of measurement for inventory',
      isEditable: true,
      isSystem: false,
      items: [
        { value: 'PIECE', displayName: 'Piece', sortOrder: 1 },
        { value: 'METER', displayName: 'Meter', sortOrder: 2 },
        { value: 'KG', displayName: 'Kilogram', sortOrder: 3 },
        { value: 'BOX', displayName: 'Box', sortOrder: 4 },
        { value: 'SET', displayName: 'Set', sortOrder: 5 },
      ],
    },
    {
      key: 'WORK_ORDER_TYPE',
      displayName: 'Work Order Types',
      description: 'Types of work orders',
      isEditable: true,
      isSystem: false,
      items: [
        { value: 'INSTALL', displayName: 'Installation', sortOrder: 1 },
        { value: 'DIAGNOSTIC', displayName: 'Diagnostic', sortOrder: 2 },
        { value: 'REPAIR', displayName: 'Repair', sortOrder: 3 },
      ],
    },
    // System enums (not editable)
    {
      key: 'WORK_ORDER_STATUS',
      displayName: 'Work Order Statuses',
      description: 'Work order lifecycle states',
      isEditable: false,
      isSystem: true,
      items: [
        { value: 'NEW', displayName: 'New', color: 'blue', sortOrder: 1, isSystem: true },
        { value: 'DISPATCHED', displayName: 'Dispatched', color: 'purple', sortOrder: 2, isSystem: true },
        { value: 'ACCEPTED', displayName: 'Accepted', color: 'indigo', sortOrder: 3, isSystem: true },
        { value: 'IN_PROGRESS', displayName: 'In Progress', color: 'amber', sortOrder: 4, isSystem: true },
        { value: 'DONE', displayName: 'Done', color: 'emerald', sortOrder: 5, isSystem: true },
        { value: 'CANCELED', displayName: 'Canceled', color: 'zinc', sortOrder: 6, isSystem: true },
      ],
    },
    {
      key: 'INCIDENT_STATUS',
      displayName: 'Incident Statuses',
      description: 'Incident lifecycle states',
      isEditable: false,
      isSystem: true,
      items: [
        { value: 'CREATED', displayName: 'Created', color: 'blue', sortOrder: 1, isSystem: true },
        { value: 'IN_PROGRESS', displayName: 'In Progress', color: 'amber', sortOrder: 2, isSystem: true },
        { value: 'COMPLETED', displayName: 'Completed', color: 'emerald', sortOrder: 3, isSystem: true },
        { value: 'WORK_ORDER_INITIATED', displayName: 'Work Order Created', color: 'purple', sortOrder: 4, isSystem: true },
      ],
    },
  ];

  for (const cat of categories) {
    const { items, ...catData } = cat;
    const category = await prisma.systemListCategory.create({
      data: catData,
    });

    for (const item of items) {
      await prisma.systemListItem.create({
        data: {
          ...item,
          categoryId: category.id,
        },
      });
    }
  }
}
```

---

## Backend API Design

### Endpoints

**List Management:**
```
GET    /api/v1/admin/system-lists                    # Get all categories
GET    /api/v1/admin/system-lists/:categoryKey       # Get items in category
POST   /api/v1/admin/system-lists/:categoryKey/items # Create new item
PATCH  /api/v1/admin/system-lists/:categoryKey/items/:id # Update item
DELETE /api/v1/admin/system-lists/:categoryKey/items/:id # Delete item (with validation)
POST   /api/v1/admin/system-lists/:categoryKey/items/:id/deactivate # Soft delete
POST   /api/v1/admin/system-lists/:categoryKey/items/reorder # Reorder items
```

**Public Endpoints (for dropdowns):**
```
GET /api/v1/system-lists/:categoryKey  # Get active items for dropdowns
```

### Safe Deletion Logic

```typescript
async deleteListItem(categoryKey: string, itemId: string) {
  const item = await this.prisma.systemListItem.findUnique({
    where: { id: itemId },
    include: { category: true },
  });

  // VALIDATION 1: System items cannot be deleted
  if (item.isSystem) {
    throw new BadRequestException('Cannot delete system-managed list item');
  }

  // VALIDATION 2: Category must be editable
  if (!item.category.isEditable) {
    throw new BadRequestException('This list category is not editable');
  }

  // VALIDATION 3: Check usage
  const usageCount = await this.checkUsage(categoryKey, item.value);

  if (usageCount > 0) {
    throw new BadRequestException(
      `Cannot delete: This value is currently used in ${usageCount} record(s). ` +
      `Please reassign or remove those records first, or deactivate this item instead.`
    );
  }

  // Safe to delete
  await this.prisma.systemListItem.delete({ where: { id: itemId } });

  return { success: true, message: 'List item deleted successfully' };
}

async checkUsage(categoryKey: string, value: string): Promise<number> {
  let count = 0;

  switch (categoryKey) {
    case 'ASSET_TYPE':
      count = await this.prisma.asset.count({ where: { type: value } });
      break;

    case 'CONTACT_METHOD':
      count = await this.prisma.incident.count({ where: { contactMethod: value } });
      break;

    case 'INCIDENT_PRIORITY':
      count = await this.prisma.incident.count({ where: { priority: value } });
      break;

    case 'PRODUCT_CATEGORY':
      count = await this.prisma.inventoryProduct.count({ where: { category: value } });
      break;

    case 'PRODUCT_UNIT':
      count = await this.prisma.inventoryProduct.count({ where: { unit: value } });
      break;

    case 'WORK_ORDER_TYPE':
      count = await this.prisma.workOrder.count({ where: { type: value } });
      break;

    default:
      break;
  }

  return count;
}

async deactivateListItem(categoryKey: string, itemId: string) {
  // Soft delete - keeps historical data intact
  await this.prisma.systemListItem.update({
    where: { id: itemId },
    data: { isActive: false },
  });

  return { success: true, message: 'List item deactivated. Existing records are unaffected.' };
}
```

---

## Frontend UI Design

### Admin Menu Structure

```
Admin
├── Positions
├── Role Groups
├── Departments
└── System Lists ← NEW
    ├── Product Types (AssetType)
    ├── Contact Methods
    ├── Incident Priorities
    ├── Product Categories
    ├── Product Units
    ├── Work Order Types
    └── [System-Managed Lists] (read-only)
        ├── Work Order Statuses
        ├── Incident Statuses
        └── ...
```

### List Management Page UI

**Page: `/app/admin/system-lists`**

```tsx
// Main page showing all categories
<div>
  <h1>System Lists Management</h1>

  {/* Editable Lists */}
  <section>
    <h2>Configurable Lists</h2>
    <div className="grid">
      <ListCategoryCard
        title="Product Types"
        description="Types of products installed in buildings"
        itemCount={7}
        lastModified="2026-01-15"
        onClick={() => navigate('/admin/system-lists/ASSET_TYPE')}
      />
      <ListCategoryCard
        title="Contact Methods"
        itemCount={4}
        ...
      />
      // ... more cards
    </div>
  </section>

  {/* System Lists (Read-Only) */}
  <section>
    <h2>System-Managed Lists</h2>
    <Alert variant="info">
      These lists are managed by the system and cannot be modified.
    </Alert>
    <div className="grid">
      <ListCategoryCard
        title="Work Order Statuses"
        isReadOnly={true}
        ...
      />
    </div>
  </section>
</div>
```

**Page: `/app/admin/system-lists/[categoryKey]`**

```tsx
// Detailed view for managing items in a category
<div>
  <Breadcrumb>
    <Link href="/admin/system-lists">System Lists</Link>
    <span>Product Types</span>
  </Breadcrumb>

  <header>
    <div>
      <h1>Product Types</h1>
      <p>Types of products/assets installed in buildings</p>
    </div>
    <button onClick={() => setShowAddModal(true)}>
      Add New Type
    </button>
  </header>

  {/* Items List (Drag & Drop Reorder) */}
  <DragDropList>
    {items.map(item => (
      <ListItemRow
        key={item.id}
        item={item}
        onEdit={() => handleEdit(item)}
        onDelete={() => handleDelete(item)}
        onDeactivate={() => handleDeactivate(item)}
        usageCount={item.usageCount}
        isSystem={item.isSystem}
      />
    ))}
  </DragDropList>
</div>
```

**List Item Row Component:**

```tsx
<div className="flex items-center gap-4 p-4 bg-white rounded-2xl">
  {/* Drag Handle */}
  <DragHandle />

  {/* Item Info */}
  <div className="flex-1">
    <div className="flex items-center gap-2">
      <span className="font-semibold">{item.displayName}</span>
      {item.isSystem && (
        <Badge variant="zinc">System</Badge>
      )}
      {!item.isActive && (
        <Badge variant="rose">Inactive</Badge>
      )}
    </div>
    <div className="text-sm text-zinc-600">
      Value: <code>{item.value}</code>
    </div>
    {item.usageCount > 0 && (
      <div className="text-xs text-zinc-500">
        Used in {item.usageCount} record(s)
      </div>
    )}
  </div>

  {/* Actions */}
  <div className="flex items-center gap-2">
    <button onClick={onEdit}>Edit</button>

    {!item.isSystem && item.usageCount === 0 && (
      <button onClick={onDelete} className="text-rose-600">
        Delete
      </button>
    )}

    {item.usageCount > 0 && (
      <button onClick={onDeactivate} className="text-amber-600">
        Deactivate
      </button>
    )}
  </div>
</div>
```

---

## Add/Edit Modal Design

```tsx
<Modal title="Add Product Type">
  <form>
    {/* Display Name */}
    <label>
      Display Name
      <input name="displayName" placeholder="e.g., Elevator" />
      <span className="text-xs">This is what users will see</span>
    </label>

    {/* Value (System Key) */}
    <label>
      System Value
      <input
        name="value"
        placeholder="e.g., ELEVATOR"
        pattern="[A-Z_]+"
      />
      <span className="text-xs">
        Uppercase letters and underscores only. Cannot be changed after creation.
      </span>
    </label>

    {/* Description (Optional) */}
    <label>
      Description (Optional)
      <textarea name="description" />
    </label>

    {/* Icon (Optional) */}
    <label>
      Icon (Optional)
      <select name="icon">
        <option>None</option>
        <option value="elevator">🏗️ Elevator</option>
        <option value="door">🚪 Door</option>
        // ... more icons
      </select>
    </label>

    {/* Color (For priorities, statuses) */}
    {category.key === 'INCIDENT_PRIORITY' && (
      <label>
        Color
        <ColorPicker name="color" />
      </label>
    )}

    <div className="flex gap-2">
      <button type="submit">Save</button>
      <button type="button" onClick={onClose}>Cancel</button>
    </div>
  </form>
</Modal>
```

---

## Delete Confirmation Modal (With Bulk Reassignment)

```tsx
<Modal title="Delete List Item?" variant="danger" maxWidth="2xl">
  <div>
    <p>
      Are you sure you want to delete <strong>{item.displayName}</strong>?
    </p>

    {item.usageCount > 0 ? (
      <>
        <Alert variant="error">
          ⚠️ This item is currently used in {item.usageCount} record(s).
        </Alert>

        <div className="mt-4">
          <h4 className="font-semibold text-zinc-900">Affected Records:</h4>
          <div className="mt-2 space-y-2">
            {usageDetails.map((usage) => (
              <div key={usage.entityType} className="flex items-center justify-between rounded-xl bg-zinc-50 p-3">
                <div>
                  <span className="font-medium text-zinc-900">{usage.entityType}</span>
                  <span className="ml-2 text-sm text-zinc-600">({usage.count} records)</span>
                </div>
                <button
                  onClick={() => viewRecords(usage.entityType)}
                  className="text-sm text-emerald-600 hover:underline"
                >
                  View Records →
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* OPTION 1: BULK REASSIGNMENT */}
        <div className="mt-6 rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-4">
          <h4 className="font-semibold text-emerald-900">
            ✨ Option 1: Reassign to Another Value (Recommended)
          </h4>
          <p className="mt-1 text-sm text-emerald-700">
            Move all {item.usageCount} records to a different value, then delete this one.
          </p>

          <div className="mt-4">
            <label className="block text-sm font-medium text-zinc-900">
              Reassign to:
            </label>
            <select
              value={reassignToItemId}
              onChange={(e) => setReassignToItemId(e.target.value)}
              className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="">-- Select a value --</option>
              {availableItems
                .filter((i) => i.id !== item.id) // Exclude current item
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.displayName} ({i.value})
                  </option>
                ))}
            </select>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <input
              type="checkbox"
              id="confirm-reassign"
              checked={confirmReassign}
              onChange={(e) => setConfirmReassign(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="confirm-reassign" className="text-sm text-zinc-700">
              I understand this will update {item.usageCount} record(s) and cannot be undone.
            </label>
          </div>

          <button
            onClick={handleReassignAndDelete}
            disabled={!reassignToItemId || !confirmReassign || loading}
            className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner /> Reassigning...
              </span>
            ) : (
              `Reassign & Delete "${item.displayName}"`
            )}
          </button>
        </div>

        {/* OPTION 2: DEACTIVATE */}
        <div className="mt-4 rounded-2xl border-2 border-amber-200 bg-amber-50 p-4">
          <h4 className="font-semibold text-amber-900">
            Option 2: Deactivate (Safe)
          </h4>
          <p className="mt-1 text-sm text-amber-700">
            Hide from new selections but keep existing records intact.
          </p>

          <button
            onClick={handleDeactivate}
            className="mt-4 w-full rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700"
          >
            Deactivate "{item.displayName}"
          </button>
        </div>

        {/* OPTION 3: CANCEL */}
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Cancel
          </button>
        </div>
      </>
    ) : (
      <>
        {/* No usage - safe to delete */}
        <Alert variant="success">
          ✓ This item is not currently used. Safe to delete.
        </Alert>

        <div className="mt-4 flex items-center gap-2">
          <input
            type="checkbox"
            id="confirm-delete"
            checked={confirmDelete}
            onChange={(e) => setConfirmDelete(e.target.checked)}
            className="rounded"
          />
          <label htmlFor="confirm-delete" className="text-sm text-zinc-700">
            I understand this action cannot be undone.
          </label>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={handleDelete}
            disabled={!confirmDelete || loading}
            className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {loading ? 'Deleting...' : 'Yes, Delete'}
          </button>
          <button
            onClick={onClose}
            className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Cancel
          </button>
        </div>
      </>
    )}
  </div>
</Modal>
```

---

## Implementation Checklist

### Phase 1: Database & Seeding (2-3 hours)
- [ ] Create Prisma schema for `SystemListCategory` and `SystemListItem`
- [ ] Create migration
- [ ] Write seed function for all existing enums
- [ ] Test migration and seed

### Phase 2: Backend API (4-6 hours)
- [ ] Create `system-lists` module
- [ ] Implement CRUD endpoints
- [ ] Implement usage checking logic
- [ ] Implement safe deletion with validation
- [ ] Add permission guards (ADMIN only)
- [ ] Test all endpoints

### Phase 3: Update Existing Modules (3-4 hours)
- [ ] Update Asset module to use SystemListItem
- [ ] Update Incident module to use SystemListItem
- [ ] Update Inventory module to use SystemListItem
- [ ] Update WorkOrder module to use SystemListItem
- [ ] Keep Prisma enums for backward compatibility (dual system)

### Phase 4: Frontend Admin UI (6-8 hours)
- [ ] Create `/admin/system-lists` page
- [ ] Create `/admin/system-lists/[categoryKey]` page
- [ ] Create Add/Edit modal
- [ ] Create Delete confirmation modal
- [ ] Implement drag-and-drop reordering
- [ ] Add validation and error handling

### Phase 5: Update Frontend Dropdowns (2-3 hours)
- [ ] Update all forms to fetch list items from API
- [ ] Cache list items in frontend
- [ ] Update existing hardcoded dropdowns

### Phase 6: Testing & Polish (2-3 hours)
- [ ] Test CRUD operations
- [ ] Test deletion validation
- [ ] Test with existing data
- [ ] Test permissions
- [ ] Update documentation

**Total Estimated Time: 19-27 hours**

---

## Migration Path for Existing Data

**Strategy: Dual System (Gradual Migration)**

1. **Phase 1**: Add new tables alongside existing enums
2. **Phase 2**: Seed new tables with existing enum values
3. **Phase 3**: Update forms to use new system (backward compatible)
4. **Phase 4**: Eventually deprecate Prisma enums (optional, low priority)

This approach ensures:
- ✅ Zero downtime
- ✅ No data loss
- ✅ Backward compatibility
- ✅ Gradual rollout
- ✅ Easy rollback

---

## Security Considerations

1. **Permission Check**: Only users with `ADMIN` role or `SYSTEM_LISTS:MANAGE` permission
2. **System Items**: Cannot modify `isSystem: true` items
3. **Validation**: Strict input validation (value must be uppercase, alphanumeric + underscore)
4. **Audit Logging**: Log all changes to system lists
5. **Deletion Protection**: Prevent deletion of items in use

---

## Future Enhancements

- [ ] Import/Export list items (CSV, JSON)
- [ ] Bulk operations
- [ ] List item translations (i18n)
- [ ] Custom validation rules per category
- [ ] API for third-party integrations
- [ ] Usage analytics dashboard
- [ ] Scheduled activation/deactivation

---

**Ready to implement?** Let me know and I'll start with Phase 1!
