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
    <section className="kiosk-card mx-auto w-full max-w-[600px] rounded-2xl p-6 shadow-lg">
      <h1 className="kiosk-title !mb-1 text-center text-4xl">Choose Fuel Type</h1>
      <p className="mb-5 text-center text-base text-slate-600">Select one or more fuel options.</p>

      <div className="kiosk-grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          {FUEL_OPTIONS.map((fuel) => (
            <label
              key={fuel}
              className={`flex h-24 items-center justify-center gap-2 rounded-2xl border text-xl font-semibold shadow-sm ${
                activeFuels.includes(fuel)
                  ? 'border-blue-600 bg-gradient-to-r from-blue-700 via-sky-600 to-cyan-500 text-white shadow-lg'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <input
                type="checkbox"
                checked={activeFuels.includes(fuel)}
                onChange={() => toggleFuel(fuel)}
                className="h-5 w-5"
              />
              <span>{fuel}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="kiosk-actions mt-4 justify-center">
        <button type="button" className="btn btn-secondary h-20 rounded-2xl" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="btn h-20 rounded-2xl bg-gradient-to-r from-blue-700 via-sky-600 to-cyan-500 text-white shadow-lg"
          onClick={() => onNext(activeFuels)}
          disabled={activeFuels.length === 0 || saving}
        >
          Continue
        </button>
      </div>
    </section>
  );
}
