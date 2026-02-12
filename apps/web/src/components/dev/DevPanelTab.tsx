import { cn } from '@qoomb/ui';

interface DevPanelTabProps {
  onClick: () => void;
  isOpen: boolean;
}

export function DevPanelTab({ onClick, isOpen }: DevPanelTabProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'fixed top-1/2 -translate-y-1/2 z-9999',
        'bg-dev-bg text-primary border-2 border-primary',
        'rounded-tl-lg rounded-bl-lg py-4 px-2 cursor-pointer',
        '[writing-mode:vertical-rl] text-[11px] font-black tracking-widest uppercase',
        'transition-all duration-300',
        'hover:bg-primary hover:text-black',
        'shadow-[-2px_2px_8px_rgba(0,0,0,0.2)] hover:shadow-[-2px_2px_8px_rgba(245,196,0,0.3)]',
        isOpen ? 'right-100 border-r-2' : 'right-0 border-r-0'
      )}
    >
      {isOpen ? '✕ Close' : '🔧 Dev'}
    </button>
  );
}
