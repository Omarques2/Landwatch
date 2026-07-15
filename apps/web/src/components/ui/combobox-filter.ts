export interface ComboboxOption {
  value: string;
  label: string;
}

// Case-insensitive filter by label. Empty term returns all options.
export function filterOptions(options: ComboboxOption[], term: string): ComboboxOption[] {
  const t = term.trim().toLowerCase();
  return t ? options.filter((o) => o.label.toLowerCase().includes(t)) : options;
}
