import { useEffect, useMemo, useState } from 'react';
import {
  getLocations,
  getSalesPersonsByLocation
} from '../../services/walkinService';

function getDisplayName(person) {
  const firstName = person?.first_name?.trim() || '';
  const lastName = person?.last_name?.trim() || '';
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || 'Unnamed salesperson';
}

export default function SalespersonSelectionScreen({
  selectedLocationId: initialLocationId,
  selectedSalespersonId,
  onBack,
  onNext,
  submitting
}) {
  const [locations, setLocations] = useState([]);
  const [salespersons, setSalespersons] = useState([]);
  const [selectedLocationId, setSelectedLocationId] = useState(initialLocationId || '');
  const [selectedId, setSelectedId] = useState(selectedSalespersonId || '');
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [loadingSalespersons, setLoadingSalespersons] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let mounted = true;

    const loadLocations = async () => {
      setLoadingLocations(true);
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
          setLoadingLocations(false);
        }
      }
    };

    loadLocations();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadSalespersons = async () => {
      if (!selectedLocationId) {
        setSalespersons([]);
        setSelectedId('');
        return;
      }

      setLoadingSalespersons(true);
      setErrorMessage('');
      try {
        const data = await getSalesPersonsByLocation(selectedLocationId);
        if (mounted) {
          setSalespersons(data || []);
          setSelectedId('');
        }
      } catch (error) {
        if (mounted) {
          setErrorMessage(error?.message || 'Unable to load salespersons.');
          setSalespersons([]);
          setSelectedId('');
        }
      } finally {
        if (mounted) {
          setLoadingSalespersons(false);
        }
      }
    };

    loadSalespersons();
    return () => {
      mounted = false;
    };
  }, [selectedLocationId]);

  const selectedLocation = useMemo(
    () => locations.find((location) => String(location.id) === String(selectedLocationId)) || null,
    [locations, selectedLocationId]
  );

  const selectedSalesperson = useMemo(
    () => salespersons.find((person) => String(person.id) === String(selectedId)) || null,
    [salespersons, selectedId]
  );

  const handleContinue = () => {
    if (!selectedSalesperson) return;
    onNext({
      salespersonId: selectedSalesperson.id,
      salespersonName: getDisplayName(selectedSalesperson),
      locationId: selectedLocation?.id || '',
      locationName: selectedLocation?.name || ''
    });
  };

  return (
    <section className="kiosk-card mx-auto w-full max-w-[750px] h-[92vh] flex flex-col rounded-2xl p-6 text-center shadow-lg">
      <h1 className="kiosk-title !mb-1 text-4xl">Select Sales Advisor</h1>
      <p className="mb-5 text-base text-slate-600">Choose a branch and then your preferred sales advisor.</p>

      <div className="flex-1 min-h-0">
        <div className="kiosk-grid gap-4">
          {loadingLocations ? <p>Loading branches...</p> : null}
          {loadingSalespersons ? <p>Loading salesperson list...</p> : null}
        {errorMessage ? <p className="error-text">{errorMessage}</p> : null}

          {!loadingLocations ? (
            <div className="mx-auto w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <label className="mb-3 block text-left text-xl font-semibold text-slate-700" htmlFor="branch-select">
                Branch
              </label>
              <select
                id="branch-select"
                className="kiosk-select rounded-2xl text-xl h-20"
                value={selectedLocationId}
                onChange={(event) => setSelectedLocationId(event.target.value)}
              >
                <option value="">Select Branch</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name || `Branch #${location.id}`}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {!loadingLocations ? (
            <div className="mx-auto w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <label className="mb-3 block text-left text-xl font-semibold text-slate-700" htmlFor="salesperson-select">
                Sales Advisor
              </label>

              {selectedLocationId ? (
                <select
                  id="salesperson-select"
                  className="kiosk-select rounded-2xl text-xl h-20"
                  value={selectedId}
                  onChange={(event) => setSelectedId(event.target.value)}
                >
                  <option value="">Select Sales Advisor</option>
                  {salespersons.map((person) => (
                    <option key={person.id} value={person.id}>
                      {getDisplayName(person)}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-left text-slate-600">Select a branch to view advisors.</p>
              )}

              {selectedLocationId && !loadingSalespersons && salespersons.length === 0 ? (
                <p className="text-left text-slate-600">No advisors available for this branch.</p>
              ) : null}
            </div>
          ) : null}
        </div>

        {!loadingLocations && locations.length === 0 ? (
          <p className="mt-3 text-center text-slate-600">No branches available.</p>
        ) : null}
      </div>

      <div className="kiosk-actions mt-4 justify-center">
        <button type="button" className="btn btn-secondary h-20 rounded-2xl" onClick={onBack} disabled={submitting}>
          Back
        </button>
        <button
          type="button"
          className="btn h-20 rounded-2xl bg-gradient-to-r from-blue-700 via-sky-600 to-cyan-500 text-white shadow-lg"
          onClick={handleContinue}
          disabled={!selectedSalesperson || !selectedLocation || loadingLocations || loadingSalespersons || submitting}
        >
          {submitting ? 'Submitting...' : 'Submit'}
        </button>
      </div>
    </section>
  );
}