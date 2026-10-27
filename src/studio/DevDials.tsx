import { useEffect } from "react";
import { DialRoot, useDialKit } from "dialkit";
import "dialkit/styles.css";

const studio = () => document.querySelector<HTMLElement>(".studio");
const read = (name: string) => getComputedStyle(studio()!).getPropertyValue(name).trim();

/**
 * Live dials for the panels' radius, border, fill and spacing, writing the custom
 * properties the panels already read. Dev only: it is loaded lazily behind
 * `import.meta.env.DEV` and `?dials`, so none of it ships. Defaults are whatever the stylesheet says,
 * so an untouched dial changes nothing.
 */
export default function DevDials() {
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
