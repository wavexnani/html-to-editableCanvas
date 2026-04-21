interface Props {
  onImportFile: (file: File) => void;
  onLoadSample: () => void;
  onAddText: () => void;
  onAddRect: () => void;
  onAddImage: (file: File) => void;
  onExportPng: () => void;
  onExportJson: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
  busy: boolean;
}

export function Toolbar({
  onImportFile,
  onLoadSample,
  onAddText,
  onAddRect,
  onAddImage,
  onExportPng,
  onExportJson,
  onZoomIn,
  onZoomOut,
  onZoomFit,
  busy,
}: Props) {
  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <label className="btn" data-variant="primary">
          <input
            type="file"
            accept=".html,.htm,text/html"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportFile(f);
              e.target.value = "";
            }}
            hidden
          />
          Import HTML
        </label>
        <button className="btn" onClick={onLoadSample} disabled={busy}>
          Load Sample
        </button>
      </div>

      <div className="toolbar-sep" />

      <div className="toolbar-group">
        <button className="btn" onClick={onAddText} title="Add text">+ Text</button>
        <button className="btn" onClick={onAddRect} title="Add rectangle">+ Rect</button>
        <label className="btn" title="Add image">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onAddImage(f);
              e.target.value = "";
            }}
            hidden
          />
          + Image
        </label>
      </div>

      <div className="toolbar-sep" />

      <div className="toolbar-group">
        <button className="btn" onClick={onZoomOut} title="Zoom out">−</button>
        <button className="btn" onClick={onZoomFit} title="Zoom to fit">Fit</button>
        <button className="btn" onClick={onZoomIn} title="Zoom in">+</button>
      </div>

      <div className="toolbar-spacer" />

      <div className="toolbar-group">
        <button className="btn" onClick={onExportJson}>Export JSON</button>
        <button className="btn" data-variant="primary" onClick={onExportPng}>
          Export PNG
        </button>
      </div>
    </div>
  );
}
