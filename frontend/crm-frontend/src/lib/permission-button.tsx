"use client";

import { ReactNode } from "react";
import { usePermissions } from "./use-permissions";

type PermissionButtonProps = {
  permission: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
  type?: "button" | "submit" | "reset";
  [key: string]: any; // Allow other props
};

/**
 * Button that only renders if user has the required permission
 */
export function PermissionButton({
  permission,
  children,
  className,
  onClick,
  disabled,
  style,
  type = "button",
  ...props
}: PermissionButtonProps) {
  const { hasPermission, loading } = usePermissions();

  // Don't render if no permission
  if (!loading && !hasPermission(permission)) {
    return null;
  }

  // Show disabled button while loading
  if (loading) {
    return (
      <button
        type={type}
        className={className}
        disabled
        style={style}
        {...props}
      >
        {children}
      </button>
    );
  }

  return (
    <button
      type={type}
      className={className}
      onClick={onClick}
      disabled={disabled}
      style={style}
      {...props}
    >
      {children}
    </button>
  );
}
