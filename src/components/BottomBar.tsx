interface Props {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
  onZoomReset: () => void;
  status?: string;
}

export function BottomBar({ zoom, onZoomIn, onZoomOut, onZoomFit, onZoomReset, status }: Props) {
  return (
    <div className="bottom-bar">
      <div className="bb-left">
        {status ? <span className="status-pill">{status}</span> : null}
      </div>
      <div className="bb-right">
        <button className="btn sq" title="Zoom to fit" onClick={onZoomFit}>⤢</button>
        <button className="btn sq" title="Zoom out (Ctrl + -)" onClick={onZoomOut}>−</button>
        <span className="zoom-label">{Math.round(zoom * 100)}%</span>
        <button className="btn sq" title="Zoom in (Ctrl + +)" onClick={onZoomIn}>+</button>
        <button className="btn" title="Reset to 100%" onClick={onZoomReset}>100%</button>
      </div>
    </div>
  );
}
