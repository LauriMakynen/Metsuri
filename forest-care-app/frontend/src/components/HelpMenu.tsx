import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BookOpen, CircleQuestionMark, LifeBuoy, X } from 'lucide-react';
import { shouldShowHelpTooltip } from '../utils/helpTooltip';

const LINKS = [
  { to: '/ohje', label: 'Käyttöohje', Icon: LifeBuoy },
  { to: '/metsanhoito', label: 'Tietoa metsänhoidosta', Icon: BookOpen },
];

// One floating help button (bottom right) that opens the user guide and the forest care guide
export default function HelpMenu() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [showTooltip, setShowTooltip] = useState(() => shouldShowHelpTooltip());
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // Close when clicking elsewhere or pressing Escape (choosing a link closes it too)
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="nav-help" ref={rootRef}>
      {open && (
        <ul id={menuId} className="nav-help-menu">
          {LINKS.map(({ to, label, Icon }) => (
            <li key={to}>
              <Link to={to} aria-current={pathname === to ? 'page' : undefined} onClick={() => setOpen(false)}>
                <Icon size={18} aria-hidden="true" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="nav-help-link"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="Apua ja ohjeet"
        title="Apua ja ohjeet"
        onClick={() => {
          setOpen((isOpen) => !isOpen);
          setShowTooltip(false);
        }}
      >
        {open ? <X size={22} aria-hidden="true" /> : <CircleQuestionMark size={24} aria-hidden="true" />}
      </button>
      {showTooltip && !open && (
        <span className="nav-help-tooltip">
          Tarvitsetko apua?
          <button
            type="button"
            className="nav-help-tooltip-close"
            aria-label="Sulje ohjeteksti"
            onClick={() => setShowTooltip(false)}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </span>
      )}
    </div>
  );
}
