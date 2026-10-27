import { useEffect, useState } from "react";
import { DialRoot, useDialKit, useDialKitController } from "dialkit";
import "dialkit/styles.css";

const studio = () => document.querySelector<HTMLElement>(".studio");
const read = (name: string) => getComputedStyle(studio()!).getPropertyValue(name).trim();

/** The panels' sizes in px. The scene and assets share the left column's width, and the
 *  properties and effects share the right one's; the scene and properties take the height
 *  the panel under them leaves. */
export interface PanelSizes {
  leftWidth: number;
  rightWidth: number;
  assetsHeight: number;
  effectsHeight: number;
  timelineHeight: number;
}

const SIZE_KEYS: (keyof PanelSizes)[] = [
  "leftWidth",
  "rightWidth",
  "assetsHeight",
  "effectsHeight",
  "timelineHeight",
];

/**
 * Live dials for the panels' radius, border, fill and spacing, writing the custom
 * properties the panels already read. Dev only: it is loaded lazily behind
 * `import.meta.env.DEV` and `?dials`, so none of it ships. Defaults are whatever the stylesheet says,
 * so an untouched dial changes nothing.
 */
export default function DevDials({
  sizes,
  onSize,
}: {
  sizes: PanelSizes;
  onSize: (key: keyof PanelSizes, value: number) => void;
}) {
  // Fixed at mount: a config that follows `sizes` would re-register the panel on every drag.
  const [config] = useState(() => ({
    leftWidth: [sizes.leftWidth, 280, 600, 1] as [number, number, number, number],
    rightWidth: [sizes.rightWidth, 300, 600, 1] as [number, number, number, number],
    assetsHeight: [sizes.assetsHeight, 160, 700, 1] as [number, number, number, number],
    effectsHeight: [sizes.effectsHeight, 200, 700, 1] as [number, number, number, number],
    timelineHeight: [sizes.timelineHeight, 150, 700, 1] as [number, number, number, number],
  }));
  const dial = useDialKitController("Sizes", config);
  const dialled = dial.values;

  // Two ways: a dial moves its panel, and dragging a panel moves its dial. Each side
  // only acts when the other disagrees, so neither can echo the other back.
  useEffect(() => {
    for (const key of SIZE_KEYS) if (dialled[key] !== sizes[key]) onSize(key, dialled[key]);
  }, [dialled]);
  useEffect(() => {
    for (const key of SIZE_KEYS) if (dialled[key] !== sizes[key]) dial.setValue(key, sizes[key]);
  }, [sizes]);

  const look = useDialKit("Panels", {
    radius: [parseFloat(read("--panel-radius")), 0, 32, 1],
    borderWidth: [parseFloat(read("--panel-border-width")), 0, 4, 1],
    borderColor: read("--panel-border-color"),
    background: read("--panel-bg"),
    gap: [parseFloat(read("--gap")), 0, 24, 1],
    edge: [parseFloat(read("--edge")), 0, 32, 1],
  });

  useEffect(() => {
    const el = studio();
    if (!el) return;
    el.style.setProperty("--panel-radius", `${look.radius}px`);
    el.style.setProperty("--panel-border-width", `${look.borderWidth}px`);
    el.style.setProperty("--panel-border-color", look.borderColor);
    el.style.setProperty("--panel-bg", look.background);
    el.style.setProperty("--gap", `${look.gap}px`);
    el.style.setProperty("--edge", `${look.edge}px`);
  }, [look]);

  return <DialRoot position="bottom-left" theme="light" defaultOpen={false} />;
}
