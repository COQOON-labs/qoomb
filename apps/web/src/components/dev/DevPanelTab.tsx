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
        backgroundColor: isHovered ? '#F5C400' : '#111110',
        color: isHovered ? '#000' : '#F5C400',
        border: '2px solid #F5C400',
        borderRight: isOpen ? '2px solid #F5C400' : 'none',
        borderTopLeftRadius: '8px',
        borderBottomLeftRadius: '8px',
        padding: '16px 8px',
        cursor: 'pointer',
        writingMode: 'vertical-rl',
        fontSize: '11px',
        fontWeight: '900',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        zIndex: 9999,
        transition: 'all 0.3s ease',
        boxShadow: isHovered
          ? '-2px 2px 8px rgba(245, 196, 0, 0.3)'
          : '-2px 2px 8px rgba(0, 0, 0, 0.2)',
      }}
    >
      {isOpen ? '✕ Close' : '🔧 Dev'}
    </button>
  );
}
