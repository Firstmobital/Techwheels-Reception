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

  const selectedModel = models.find((item) => String(item.id) === String(selectedId));

  return (
    <section className="kiosk-card mx-auto h-[92vh] max-h-[92vh] w-full max-w-[900px] rounded-2xl p-6 shadow-lg">
      <div className="flex h-full min-h-0 flex-col justify-between">
        <div className="shrink-0">
          <h1 className="kiosk-title !mb-1 text-center text-4xl">Select Model</h1>
          <p className="mb-4 text-center text-base text-slate-600">Choose a model to continue.</p>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[2fr_1fr] items-start gap-4">
          <div className="kiosk-grid content-start gap-3">
            {loading ? <p>Loading models...</p> : null}
            {errorMessage ? <p className="error-text">{errorMessage}</p> : null}

            {!loading ? (
              <div className="grid grid-cols-3 gap-3">
                {models.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => setSelectedId(String(model.id))}
                    className={
                      'h-20 rounded-2xl border text-left text-lg font-semibold shadow-sm transition ' +
                      (String(selectedId) === String(model.id)
                        ? 'border-blue-600 bg-gradient-to-r from-blue-700 via-sky-600 to-cyan-500 text-white shadow-lg'
                        : 'border-slate-200 bg-white text-slate-700')
                    }
                  >
                    <div className="px-4">{model.name || model.model_name || 'Model #' + model.id}</div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-inner">
            <h3 className="text-lg font-semibold text-slate-700">Selected Model</h3>
            <p className="mt-2 text-base text-slate-600">
              {selectedModel
                ? selectedModel.name || selectedModel.model_name || 'Model #' + selectedModel.id
                : 'Choose a model from the list'}
            </p>
          </div>
        </div>

        <div className="kiosk-actions mt-4 shrink-0 justify-center">
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
      </div>
    </section>
  );
}
