import type { ReactElement, ReactNode } from "react";
import type { KeyTarget } from "./modules";

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      {children}
    </svg>
  );
}

export function PropIcon({ prop }: { prop: KeyTarget }): ReactElement {
  switch (prop) {
    case "position":
      return (
        <Svg>
          <path {...STROKE} d="M8 2v12M2 8h12" />
          <path {...STROKE} d="M6 4 8 2l2 2M6 12l2 2 2-2M4 6 2 8l2 2M12 6l2 2-2 2" />
        </Svg>
      );
    case "x":
      return (
        <Svg>
          <path {...STROKE} d="M3 8h10M5.5 5.5 3 8l2.5 2.5M10.5 5.5 13 8l-2.5 2.5" />
        </Svg>
      );
    case "y":
      return (
        <Svg>
          <path {...STROKE} d="M8 3v10M5.5 5.5 8 3l2.5 2.5M5.5 10.5 8 13l2.5-2.5" />
        </Svg>
      );
    case "scaleX":
      return (
        <Svg>
          <path {...STROKE} d="M3 4v8M13 4v8" />
          <path {...STROKE} d="M5 8h6M6.5 6.5 5 8l1.5 1.5M9.5 6.5 11 8l-1.5 1.5" />
        </Svg>
      );
    case "scaleY":
      return (
        <Svg>
          <path {...STROKE} d="M4 3h8M4 13h8" />
          <path {...STROKE} d="M8 5v6M6.5 6.5 8 5l1.5 1.5M6.5 9.5 8 11l1.5-1.5" />
        </Svg>
      );
    case "scale":
      return (
        <Svg>
          <rect {...STROKE} x="2.5" y="2.5" width="11" height="11" rx="1" />
          <rect {...STROKE} x="6" y="6" width="4" height="4" rx="0.5" />
        </Svg>
      );
    case "rotation":
      return (
        <Svg>
          <path {...STROKE} d="M13 8a5 5 0 1 1-1.8-3.85" />
          <path {...STROKE} d="M11.4 1.8 11.6 4.5 8.9 4.3" />
        </Svg>
      );
    case "opacity":
      return (
        <Svg>
          <circle {...STROKE} cx="8" cy="8" r="5" />
          <path d="M8 3a5 5 0 0 0 0 10z" fill="currentColor" />
        </Svg>
      );
  }
}

export function ModuleIcon(): ReactElement {
  return (
    <Svg>
      <path {...STROKE} d="M8 2 14 5 8 8 2 5Z" />
      <path {...STROKE} d="M2 8l6 3 6-3M2 11l6 3 6-3" />
    </Svg>
  );
}
