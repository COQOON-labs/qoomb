import { useState } from 'react';

interface DevPanelTabProps {
  onClick: () => void;
  isOpen: boolean;
}

export function DevPanelTab({ onClick, isOpen }: DevPanelTabProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'fixed',
        right: isOpen ? '400px' : '0',
        top: '50%',
        transform: 'translateY(-50%)',
        backgroundColor: isHovered ? '#eab308' : '#1e293b',
        color: isHovered ? '#000' : '#eab308',
        border: '2px solid #eab308',
        borderRight: isOpen ? '2px solid #eab308' : 'none',
        borderTopLeftRadius: '8px',
        borderBottomLeftRadius: '8px',
        padding: '16px 8px',
        cursor: 'pointer',
        writingMode: 'vertical-rl',
        fontSize: '14px',
        fontWeight: '600',
        letterSpacing: '0.5px',
        zIndex: 9999,
        transition: 'all 0.3s ease',
        boxShadow: isHovered
          ? '-2px 2px 8px rgba(234, 179, 8, 0.3)'
          : '-2px 2px 8px rgba(0, 0, 0, 0.2)',
      }}
    >
      {isOpen ? '✕ CLOSE' : '🔧 DEV TOOLS'}
    </button>
  );
}
