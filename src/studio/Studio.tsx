import { StudioCanvas } from "./StudioCanvas";

export function Studio() {
  return (
    <div className="studio">
      <header className="studio-header" />
      <div className="studio-body">
        <div className="studio-sidebar" />
        <div className="studio-main">
          <StudioCanvas />
          <div className="studio-timeline" />
        </div>
      </div>
    </div>
  );
}
