import type { ReactElement, ReactNode } from "react";

function Icon({ size = 14, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const RING = [
  [19, 12],
  [15.5, 18.06],
  [8.5, 18.06],
  [5, 12],
  [8.5, 5.94],
  [15.5, 5.94],
];

export function ClonersIcon({ size }: { size?: number }): ReactElement {
  return (
    <Icon size={size}>
      {RING.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.25" />
      ))}
    </Icon>
  );
}

export function SplitIcon({ size }: { size?: number }): ReactElement {
  return (
    <Icon size={size}>
      <path d="M9.5 7H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h4.5" />
      <path d="M14.5 7H19a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-4.5" />
      <path d="M12 3v18" />
    </Icon>
  );
}

export function FpsIcon({ size }: { size?: number }): ReactElement {
  return (
    <Icon size={size}>
      <path d="M4.6 17.5a8.5 8.5 0 1 1 14.8 0" />
      <path d="M12 13.3 15.5 9.3" />
      <circle cx="12" cy="13.3" r="0.75" />
    </Icon>
  );
}

export function ModulesIcon({ size }: { size?: number }): ReactElement {
  return (
    <Icon size={size}>
      <path d="M12 1.6 16.5 4.2v4.5L12 11.3 7.5 8.7V4.2Z" />
      <path d="M7.5 4.2 12 6.8l4.5-2.6M12 6.8v4.5" />
      <path d="M7.5 11 12 13.6v4.5l-4.5 2.6L3 18.1v-4.5Z" />
      <path d="m3 13.6 4.5 2.6 4.5-2.6M7.5 16.2v4.5" />
      <path d="M16.5 11 21 13.6v4.5l-4.5 2.6-4.5-2.6v-4.5Z" />
      <path d="m12 13.6 4.5 2.6 4.5-2.6M16.5 16.2v4.5" />
    </Icon>
  );
}

export function AlignCenterIcon({ size }: { size?: number }): ReactElement {
  return (
    <Icon size={size}>
      <path d="M12 4V20" />
      <path d="M6.5 8H17.5" />
      <path d="M9 16H15" />
    </Icon>
  );
}

export function AlignMiddleIcon({ size }: { size?: number }): ReactElement {
  return (
    <Icon size={size}>
      <path d="M4 12H20" />
      <path d="M8 6.5V17.5" />
      <path d="M16 9V15" />
    </Icon>
  );
}

const TEXT_LINES = {
  left: ["M4 6H20", "M4 10.5H14", "M4 15H20", "M4 19.5H11"],
  center: ["M4 6H20", "M7 10.5H17", "M4 15H20", "M8.5 19.5H15.5"],
  right: ["M4 6H20", "M10 10.5H20", "M4 15H20", "M13 19.5H20"],
};

export function TextAlignIcon({
  align,
  size,
}: {
  align: keyof typeof TEXT_LINES;
  size?: number;
}): ReactElement {
  return (
    <Icon size={size}>
      {TEXT_LINES[align].map((d) => (
        <path key={d} d={d} />
      ))}
    </Icon>
  );
}
