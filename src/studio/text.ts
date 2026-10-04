export const capitalize = (text: string): string =>
  text.charAt(0).toUpperCase() + text.slice(1);

export const typeName = (type: string): string =>
  capitalize(type.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase());
