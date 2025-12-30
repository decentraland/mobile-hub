import { useMapState } from '../context/useMapHooks';
import styles from '../styles/MapView.module.css';

export function CoordinateDisplay() {
  const { interaction } = useMapState();
  const { hoveredParcel } = interaction;

  if (!hoveredParcel) {
    return null;
  }

  return (
    <div className={styles.coordinateDisplay}>
      {hoveredParcel.x}, {hoveredParcel.y}
    </div>
  );
}
