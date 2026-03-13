import { useEffect, useState } from 'react';
import { getSalesPersons } from '../../services/walkinService';

export default function AssignSalespersonModal({ walkin, onAssign, onClose }) {
  const [salespersonId, setSalespersonId] = useState('');
  const [salespersons, setSalespersons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  if (!walkin) return null;

  useEffect(() => {
    let mounted = true;

    const loadSalespersons = async () => {
      setErrorMessage('');
      setLoading(true);
      try {
        const data = await getSalesPersons();
        if (mounted) setSalespersons(data);
      } catch (error) {
        if (mounted) setErrorMessage(error?.message || 'Unable to load salespersons.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadSalespersons();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-card">
        <h2>Assign Salesperson</h2>
        <p>
          Customer: {walkin.customer_name || walkin.name}
        </p>

        {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
        {loading ? <p>Loading salesperson list...</p> : null}

        <select
          className="kiosk-select"
          value={salespersonId}
          onChange={(event) => setSalespersonId(event.target.value)}
          disabled={loading}
        >
          <option value="">Select salesperson</option>
          {salespersons.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name || person.full_name || `Employee #${person.id}`}
            </option>
          ))}
        </select>

        <div className="kiosk-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => salespersonId && onAssign(Number(salespersonId))}
            disabled={!salespersonId || loading}
          >
            Assign
          </button>
        </div>
      </div>
    </div>
  );
}
