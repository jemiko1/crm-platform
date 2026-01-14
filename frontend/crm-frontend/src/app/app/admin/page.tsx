"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const BRAND = "rgb(8, 117, 56)";

type AdminSection = {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
};

const adminSections: AdminSection[] = [
  {
    id: "departments",
    title: "Departments",
    description: "Organize company structure and department hierarchy",
    icon: <IconDepartments />,
    href: "/app/admin/departments",
  },
  {
    id: "roles",
    title: "Roles & Permissions",
    description: "Configure user roles and access permissions",
    icon: <IconRoles />,
    href: "/app/admin/roles",
  },
  {
    id: "users",
    title: "User Accounts",
    description: "Manage user accounts and authentication",
    icon: <IconUsers />,
    href: "/app/admin/users",
  },
];

export default function AdminPanelPage() {
  const pathname = usePathname();

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-zinc-900">Admin Panel</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Manage your organization's settings, users, and permissions
        </p>
      </div>

      {/* Admin Sections Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {adminSections.map((section) => {
          const isActive = pathname === section.href || pathname.startsWith(section.href + "/");
          
          return (
            <Link
              key={section.id}
              href={section.href}
              className={`group relative rounded-2xl border-2 p-6 transition-all hover:shadow-lg ${
                isActive
                  ? "border-emerald-500 bg-emerald-50/50 shadow-md"
                  : "border-zinc-200 bg-white hover:border-emerald-300"
              }`}
            >
              {/* Icon */}
              <div
                className={`mb-4 inline-flex rounded-2xl p-3 transition ${
                  isActive
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-zinc-100 text-zinc-600 group-hover:bg-emerald-100 group-hover:text-emerald-700"
                }`}
              >
                {section.icon}
              </div>

              {/* Content */}
              <div>
                <h3 className="text-lg font-semibold text-zinc-900">{section.title}</h3>
                <p className="mt-2 text-sm text-zinc-600">{section.description}</p>
              </div>

              {/* Arrow */}
              <div
                className={`mt-4 flex items-center text-sm font-semibold transition ${
                  isActive ? "text-emerald-700" : "text-zinc-500 group-hover:text-emerald-600"
                }`}
              >
                Manage
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="ml-2 transition-transform group-hover:translate-x-1"
                >
                  <path
                    d="M9 18l6-6-6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              {/* Active indicator */}
              {isActive && (
                <div
                  className="absolute right-4 top-4 h-2 w-2 rounded-full"
                  style={{ backgroundColor: BRAND }}
                />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// Icons
function IconDepartments() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M9 22V12h6v10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M3 9h18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconRoles() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2L2 7l10 5 10-5-10-5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M2 17l10 5 10-5M2 12l10 5 10-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M4 21a8 8 0 0 1 16 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M20 8.5a3 3 0 0 1 0 5.8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
