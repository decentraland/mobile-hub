import { useMapDispatch } from '../context/useMapHooks';
import styles from '../styles/MapView.module.css';

export function MapControls() {
  const dispatch = useMapDispatch();

  const handleZoomIn = () => {
    dispatch({ type: 'ZOOM', payload: { factor: 1.5 } });
  };

  const handleZoomOut = () => {
    dispatch({ type: 'ZOOM', payload: { factor: 0.67 } });
  };

  const handleReset = () => {
    dispatch({ type: 'RESET_VIEW' });
  };
  return (
    <div className={styles.controls}>
      <button
        className={styles.controlButton}
        onClick={handleZoomIn}
        title="Zoom In"
        aria-label="Zoom In"
      >
        +
      </button>
      <button
        className={styles.controlButton}
        onClick={handleZoomOut}
        title="Zoom Out"
        aria-label="Zoom Out"
      >
        -
      </button>
      <button
        className={styles.controlButton}
        onClick={handleReset}
        title="Reset View"
        aria-label="Reset View"
      >
        &#8962;
      </button>
    </div>
  );
}
