import { useEffect, useMemo, useState } from 'react';
import { getSalesPersons } from '../../services/walkinService';

function getDisplayName(person) {
  const firstName = person?.first_name?.trim() || '';
  const lastName = person?.last_name?.trim() || '';
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || 'Unnamed salesperson';
}

export default function SalespersonSelectionScreen({
  selectedSalespersonId,
  onBack,
  onNext,
  submitting
}) {
  const [salespersons, setSalespersons] = useState([]);
  const [selectedId, setSelectedId] = useState(selectedSalespersonId || '');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let mounted = true;

    const loadSalespersons = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const data = await getSalesPersons();
        if (mounted) {
          setSalespersons(data);
        }
      } catch (error) {
        if (mounted) {
          setErrorMessage(error?.message || 'Unable to load salespersons.');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadSalespersons();
    return () => {
      mounted = false;
    };
  }, []);

  const selectedSalesperson = useMemo(
    () => salespersons.find((person) => String(person.id) === String(selectedId)) || null,
    [salespersons, selectedId]
  );

  const handleContinue = () => {
    if (!selectedSalesperson) return;
    onNext({
      salespersonId: selectedSalesperson.id,
      salespersonName: getDisplayName(selectedSalesperson)
    });
  };

  return (
    <section className="kiosk-card mx-auto w-full max-w-[600px] rounded-2xl p-6 text-center shadow-lg">
      <h1 className="kiosk-title !mb-1 text-4xl">Select Sales Advisor</h1>
      <p className="mb-5 text-base text-slate-600">Choose your preferred advisor before submitting.</p>

      <div className="kiosk-grid gap-4">
        {loading ? <p>Loading salesperson list...</p> : null}
        {errorMessage ? <p className="error-text">{errorMessage}</p> : null}

        {!loading ? (
          <div className="mx-auto w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="mb-3 block text-left text-xl font-semibold text-slate-700" htmlFor="salesperson-select">
              Sales Advisor
            </label>
            <select
              id="salesperson-select"
              className="kiosk-select rounded-2xl text-xl"
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
          </div>
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
          disabled={!selectedSalesperson || loading || submitting}
        >
          {submitting ? 'Submitting...' : 'Submit'}
        </button>
      </div>
    </section>
  );
}