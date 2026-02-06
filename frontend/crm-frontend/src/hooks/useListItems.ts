import { useState, useEffect } from "react";
import { apiGet } from "@/lib/api";

type ListItem = {
  id: string;
  value: string;
  displayName: string;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  colorHex?: string | null;
};

type ListCategory = {
  id: string;
  code: string;
  name: string;
  items: ListItem[];
};

/**
 * Hook to fetch dynamic list items from SystemLists API
 * @param categoryCode - The category code (e.g., "PRODUCT_CATEGORY", "ASSET_TYPE")
 * @param fetchOnMount - Whether to fetch immediately on mount (default: true)
 * @returns { items, loading, error, refresh }
 */
export function useListItems(categoryCode: string, fetchOnMount: boolean = true) {
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(fetchOnMount);
  const [error, setError] = useState<string | null>(null);

  async function fetchItems() {
    try {
      setLoading(true);
      setError(null);
      const data = await apiGet<ListCategory>(`/v1/system-lists/categories/code/${categoryCode}`);

      // Filter only active items and sort by sortOrder
      const activeItems = data.items
        .filter((item) => item.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder);

      setItems(activeItems);
    } catch (err) {
      console.error(`Failed to load list items for ${categoryCode}:`, err);
      setError(err instanceof Error ? err.message : "Failed to load list items");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (fetchOnMount) {
      fetchItems();
    }
  }, [categoryCode, fetchOnMount]);

  return {
    items,
    loading,
    error,
    refresh: fetchItems,
  };
}
