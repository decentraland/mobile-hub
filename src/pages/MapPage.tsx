import { MapView } from '../features/map';
import type { ParcelCoord } from '../features/map';

export function MapPage() {
  const handleParcelClick = (parcel: ParcelCoord) => {
    console.log('Clicked parcel:', parcel.x, parcel.y);
  };

  return <MapView onParcelClick={handleParcelClick} />;
}
