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
    const selectedModel = models.find(
      (item) => String(item.id) === String(selectedId)
    );
    if (!selectedModel) return;

    onNext({
      carId: selectedModel.id,
      carName:
        selectedModel.name ||
        selectedModel.model_name ||
        'Selected model'
    });
  };

  return (
    <section className="kiosk-card mx-auto w-full max-w-[750px] h-[92vh] flex flex-col rounded-2xl p-6 shadow-lg">

      {/* Header */}
      <div className="shrink-0 text-center">
        <h1 className="kiosk-title text-4xl mb-1">Select Model</h1>
        <p className="text-base text-slate-600">
          Choose a model to continue.
        </p>
      </div>

      {/* Model Grid */}
      <div className="flex-1 mt-6 min-h-0">

        {loading && (
          <p className="text-center">Loading models...</p>
        )}

        {errorMessage && (
          <p className="error-text text-center">
            {errorMessage}
          </p>
        )}

        {!loading && !errorMessage && (
          <div className="grid grid-cols-2 gap-4 h-full auto-rows-fr">

            {models.map((model) => (
              <button
                key={model.id}
                type="button"
                onClick={() => setSelectedId(String(model.id))}
                className={`flex items-center justify-center rounded-2xl border text-lg font-semibold shadow-sm transition text-center px-4 h-full
                ${
                  String(selectedId) === String(model.id)
                    ? 'border-blue-600 bg-gradient-to-r from-blue-700 via-sky-600 to-cyan-500 text-white shadow-lg'
                    : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                {model.name || model.model_name || `Model #${model.id}`}
              </button>
            ))}

          </div>
        )}

        {!loading && !models.length && (
          <p className="text-center text-slate-600">
            No models available.
          </p>
        )}

      </div>

      {/* Buttons */}
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