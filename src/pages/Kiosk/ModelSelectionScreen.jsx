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
    <section className="kiosk-card">
      <h1 className="kiosk-title">Select Model</h1>
      <div className="kiosk-grid">
        {loading ? <p>Loading models...</p> : null}
        {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
        {!loading ? (
          <select
            className="kiosk-select"
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            <option value="" disabled>
              Choose a model
            </option>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name || model.model_name || `Model #${model.id}`}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <div className="kiosk-actions">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          Back
        </button>
        <button type="button" className="btn btn-primary" onClick={handleContinue} disabled={!selectedId || loading}>
          Continue
        </button>
      </div>
    </section>
  );
}
