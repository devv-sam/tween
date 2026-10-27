export const capitalize = (text: string): string =>
  text.charAt(0).toUpperCase() + text.slice(1);

export const typeName = (type: string): string =>
  capitalize(type.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase());

const WEIGHT_NAMES: Record<number, string> = {
  100: "Thin",
  200: "Extra Light",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "Semi Bold",
  700: "Bold",
  800: "Extra Bold",
  900: "Black",
};

/** A font weight by name, or the number itself when it falls between the named ones. */
export const weightName = (weight: number): string => WEIGHT_NAMES[weight] ?? String(weight);
