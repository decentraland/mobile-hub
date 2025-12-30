import { useGroupsState, useGroupsDispatch } from '../context/useGroupsHooks';
import type { MapMode } from '../types';

interface ModeOption {
  mode: MapMode;
  icon: string;
  label: string;
}

const MODES: ModeOption[] = [
  { mode: 'view', icon: '👁', label: 'View' },
  { mode: 'groups', icon: '▦', label: 'Scene Groups' },
];

export function MapToolsBar() {
  const { mode } = useGroupsState();
  const dispatch = useGroupsDispatch();

  const handleModeSelect = (newMode: MapMode) => {
    dispatch({ type: 'SET_MODE', payload: newMode });
  };

  return (
    <div style={styles.container}>
      <div style={styles.bar}>
        {MODES.map((option) => (
          <button
            key={option.mode}
            style={{
              ...styles.button,
              ...(option.mode === mode ? styles.buttonActive : {}),
            }}
            onClick={() => handleModeSelect(option.mode)}
            title={option.label}
          >
            <span style={styles.icon}>{option.icon}</span>
            <span style={styles.label}>{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'absolute',
    top: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 100,
  },
  bar: {
    display: 'flex',
    gap: 4,
    padding: 4,
    background: 'rgba(28, 28, 32, 0.95)',
    borderRadius: 12,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    border: 'none',
    borderRadius: 8,
    background: 'transparent',
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 14,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap',
  },
  buttonActive: {
    background: 'rgba(255, 255, 255, 0.1)',
    color: '#00D9FF',
  },
  icon: {
    fontSize: 16,
  },
  label: {
    fontWeight: 500,
  },
};
