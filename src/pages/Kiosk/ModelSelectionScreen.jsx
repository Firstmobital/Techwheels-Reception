import { useEffect, useState } from 'react';
import { getAvailableCars } from '../../services/walkinService';

export default function ModelSelectionScreen({ selectedModelId, onNext, onBack }) {
  const [models, setModels] = useState([]);
  const [selectedId, setSelectedId] = useState(selectedModelId || '');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let mounted = true;

    const loadCars = async () => {
      try {
        const data = await getAvailableCars();
        if (mounted) setModels(data);
      } catch (error) {
        if (mounted) setErrorMessage(error?.message || 'Unable to load models.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadCars();
    return () => {
      mounted = false;
    };
  }, []);

  const handleContinue = () => {
    const selectedModel = models.find((item) => String(item.id) === String(selectedId));
    if (!selectedModel) return;
    onNext({ carId: selectedModel.id, carName: selectedModel.name || selectedModel.model_name || 'Selected model' });
  };

  return (
    <section className="kiosk-card mx-auto w-full max-w-[600px] rounded-2xl p-6 shadow-lg">
      <h1 className="kiosk-title !mb-1 text-center text-4xl">Select Model</h1>
      <p className="mb-5 text-center text-base text-slate-600">Choose a model to continue.</p>

      <div className="kiosk-grid gap-4">
        {loading ? <p>Loading models...</p> : null}
        {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
        {!loading ? (
          <div className="grid grid-cols-2 gap-3">
            {models.map((model) => (
              <button
                key={model.id}
                type="button"
                onClick={() => setSelectedId(String(model.id))}
                className={`h-24 rounded-2xl border text-left text-lg font-semibold shadow-sm transition ${
                  String(selectedId) === String(model.id)
                    ? 'border-blue-600 bg-gradient-to-r from-blue-700 via-sky-600 to-cyan-500 text-white shadow-lg'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                <div className="px-4">{model.name || model.model_name || `Model #${model.id}`}</div>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="kiosk-actions mt-4 justify-center">
        <button type="button" className="btn btn-secondary h-20 rounded-2xl" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="btn h-20 rounded-2xl bg-gradient-to-r from-blue-700 via-sky-600 to-cyan-500 text-white shadow-lg"
          onClick={handleContinue}
          disabled={!selectedId || loading}
        >
          Continue
        </button>
      </div>
    </section>
  );
}
