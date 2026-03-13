import { useEffect, useState } from 'react';
import { getLocations } from '../../services/walkinService';

export default function LocationSelectionScreen({ selectedLocationId, onBack, onNext }) {
  const [locations, setLocations] = useState([]);
  const [selectedId, setSelectedId] = useState(selectedLocationId || '');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let mounted = true;

    const loadLocations = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const data = await getLocations();
        if (mounted) {
          setLocations(data);
        }
      } catch (error) {
        if (mounted) {
          setErrorMessage(error?.message || 'Unable to load branches.');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadLocations();
    return () => {
      mounted = false;
    };
  }, []);

  const handleContinue = () => {
    const selectedLocation = locations.find((item) => String(item.id) === String(selectedId));
    if (!selectedLocation) return;

    onNext({
      locationId: selectedLocation.id,
      locationName: selectedLocation.name || 'Selected branch'
    });
  };

  return (
    <section className="kiosk-card mx-auto w-full max-w-[750px] h-[92vh] flex flex-col rounded-2xl p-6 shadow-lg">
      <div className="shrink-0 text-center">
        <h1 className="kiosk-title text-4xl mb-1">Select Branch</h1>
      </div>

      <div className="flex-1 mt-6 min-h-0">
        {loading && <p className="text-center">Loading branches...</p>}

        {errorMessage && <p className="error-text text-center">{errorMessage}</p>}

        {!loading && !errorMessage && (
          <div className="grid grid-cols-2 gap-4 h-full auto-rows-fr">
            {locations.map((location) => (
              <button
                key={location.id}
                type="button"
                onClick={() => setSelectedId(String(location.id))}
                className={`flex items-center justify-center rounded-2xl border text-lg font-semibold shadow-sm transition text-center px-4 h-full
                ${
                  String(selectedId) === String(location.id)
                    ? 'border-blue-600 bg-gradient-to-r from-blue-700 via-sky-600 to-cyan-500 text-white shadow-lg'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                {location.name || `Branch #${location.id}`}
              </button>
            ))}
          </div>
        )}

        {!loading && !locations.length && (
          <p className="text-center text-slate-600">No branches available.</p>
        )}
      </div>

      <div className="kiosk-actions shrink-0 justify-center mt-4">
        <button
          type="button"
          className="btn btn-secondary h-16 rounded-2xl"
          onClick={onBack}
        >
          Back
        </button>

        <button
          type="button"
          className="btn h-16 rounded-2xl bg-gradient-to-r from-blue-700 via-sky-600 to-cyan-500 text-white shadow-lg"
          onClick={handleContinue}
          disabled={!selectedId || loading}
        >
          Continue
        </button>
      </div>
    </section>
  );
}
