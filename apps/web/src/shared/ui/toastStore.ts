import { create } from 'zustand';

export type ToastVariant = 'info' | 'success' | 'error' | 'warning' | 'up' | 'down';

export interface ToastItem {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
  icon?: string;
  /** ms; 0 keeps the toast until dismissed. */
  duration: number;
}

interface ToastState {
  toasts: ToastItem[];
  push: (
    toast: Omit<ToastItem, 'id' | 'duration' | 'variant'> &
      Partial<Pick<ToastItem, 'duration' | 'variant'>>,
  ) => number;
  dismiss: (id: number) => void;
  clear: () => void;
}

const MAX_TOASTS = 5;
let nextId = 1;

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push: (toast) => {
    const id = nextId++;
    const item: ToastItem = { variant: 'info', duration: 4000, ...toast, id };
    set((s) => ({ toasts: [...s.toasts, item].slice(-MAX_TOASTS) }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

export const toast = {
  show: (t: Parameters<ToastState['push']>[0]) => useToastStore.getState().push(t),
  dismiss: (id: number) => useToastStore.getState().dismiss(id),
};
