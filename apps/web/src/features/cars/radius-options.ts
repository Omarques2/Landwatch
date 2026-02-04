export type RadiusOption = {
  label: string;
  value: number;
};

export function buildRadiusOptions(): RadiusOption[] {
  const options: RadiusOption[] = [];
  for (let km = 10; km <= 100; km += 10) {
    options.push({ label: `${km} km`, value: km * 1000 });
  }
  return options;
}
