/** Standalone auth storage — uses localStorage (no Lovable preview bridge). */
export function createPreviewAuthStorage() {
  if (typeof window === "undefined") {
    return {
      getItem: async () => null,
      setItem: async () => undefined,
      removeItem: async () => undefined,
    };
  }
  return {
    getItem: async (key: string) => localStorage.getItem(key),
    setItem: async (key: string, value: string) => {
      localStorage.setItem(key, value);
    },
    removeItem: async (key: string) => {
      localStorage.removeItem(key);
    },
  };
}
