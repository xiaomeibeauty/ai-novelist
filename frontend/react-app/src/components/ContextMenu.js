import React, { useEffect, useRef } from 'react';
import './ContextMenu.css';

function ContextMenu({ x, y, items, onClose }) {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  if (!x || !y || !items.length) return null;

  return (
    <ul
      className="context-menu"
      ref={menuRef}
      style={{ top: y, left: x }}
    >
      {items.map((item, index) => (
        <li key={index} onClick={() => { item.onClick(); onClose(); }}>
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export default ContextMenu;