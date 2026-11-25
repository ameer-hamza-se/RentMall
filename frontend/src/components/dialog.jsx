import { useEffect, useRef } from 'react';

export function Dialog({ title, subtitle, className = '', headingMark, onClose, busy, children }) {
  const dialog = useRef(null);
  const heading = useRef(null);

  useEffect(() => {
    const node = dialog.current;
    node.showModal();
    return () => node.close();
  }, []);

  useEffect(() => {
    dialog.current.scrollTop = 0;
    heading.current.focus();
  }, [title]);

  return (
    <dialog ref={dialog} className={`rental-dialog ${className}`.trim()} aria-labelledby="dialog-title" onCancel={(event) => {
      event.preventDefault();
      if (!busy) onClose();
    }}>
      <header className="dialog-header">
        <div className="dialog-heading">
          {headingMark}
          <h2 id="dialog-title" ref={heading} tabIndex={-1}>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button className="close-button" type="button" aria-label="Close" onClick={onClose} disabled={busy}>×</button>
      </header>
      {children}
    </dialog>
  );
}
