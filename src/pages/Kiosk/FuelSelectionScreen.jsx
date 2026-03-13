import { useState } from 'react';

const FUEL_OPTIONS = ['EV', 'Petrol', 'Diesel', 'CNG'];

export default function FuelSelectionScreen({ selectedFuels, onNext, onBack, saving }) {
  const [activeFuels, setActiveFuels] = useState(selectedFuels || []);

  const toggleFuel = (fuel) => {
    setActiveFuels((prev) =>
      prev.includes(fuel) ? prev.filter((item) => item !== fuel) : [...prev, fuel]
    );
  };

  return (
    <section className="kiosk-card">
      <h1 className="kiosk-title">Choose Fuel Types</h1>
      <div className="kiosk-grid">
        <div className="fuel-grid">
          {FUEL_OPTIONS.map((fuel) => (
            <label key={fuel} className="fuel-option">
              <input
                type="checkbox"
                checked={activeFuels.includes(fuel)}
                onChange={() => toggleFuel(fuel)}
              />
              <span>{fuel}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="kiosk-actions">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => onNext(activeFuels)}
          disabled={activeFuels.length === 0 || saving}
        >
          {saving ? 'Submitting...' : 'Submit'}
        </button>
      </div>
    </section>
  );
}
