import { useEffect, useState } from 'react';
import {
  getAvailableCars,
  getSalesPersons,
  getLocations,
  updateWalkIn
} from '../../services/walkinService';

function getDisplayName(person) {
  const firstName = person?.first_name?.trim() || '';
  const lastName = person?.last_name?.trim() || '';
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || 'Unnamed salesperson';
}

function normalizeFuelSelection(fuelValue) {
  if (Array.isArray(fuelValue)) return fuelValue;
  if (typeof fuelValue === 'string' && fuelValue.trim()) {
    return fuelValue
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

const FUEL_OPTIONS = [
  { value: 'Petrol', label: 'Petrol' },
  { value: 'Diesel', label: 'Diesel' },
  { value: 'CNG', label: 'CNG' },
  { value: 'Electric', label: 'Electric' },
  { value: 'Hybrid', label: 'Hybrid' }
];

const STATUS_OPTIONS = [
  { value: 'waiting', label: 'Waiting' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'completed', label: 'Completed' }
];

export default function EditWalkinModal({ walkin, onClose, onSave }) {
  const [formData, setFormData] = useState({
    customer_name: walkin?.customer_name || '',
    mobile_number: walkin?.mobile_number || '',
    purpose: walkin?.purpose || '',
    car_id: walkin?.car_id || '',
    fuel_types: normalizeFuelSelection(walkin?.fuel_types ?? walkin?.fuel_type ?? []),
    salesperson_id: walkin?.salesperson_id || '',
    location_id: walkin?.location_id || '',
    status: walkin?.status || 'assigned'
  });

  const [cars, setCars] = useState([]);
  const [salespersons, setSalespersons] = useState([]);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      setErrorMessage('');
      setLoading(true);
      try {
        const [carsData, spData, locData] = await Promise.all([
          getAvailableCars(),
          getSalesPersons(),
          getLocations()
        ]);

        if (mounted) {
          setCars(carsData || []);
          setSalespersons(spData || []);
          setLocations(locData || []);
        }
      } catch (error) {
        if (mounted) {
          setErrorMessage(error?.message || 'Unable to load form data.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadData();
    return () => {
      mounted = false;
    };
  }, []);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFuelToggle = (fuelType) => {
    setFormData((prev) => {
      const currentFuels = prev.fuel_types || [];
      if (currentFuels.includes(fuelType)) {
        return {
          ...prev,
          fuel_types: currentFuels.filter((f) => f !== fuelType)
        };
      }
      return {
        ...prev,
        fuel_types: [...currentFuels, fuelType]
      };
    });
  };

  const handleSave = async () => {
    if (!formData.customer_name?.trim()) {
      setErrorMessage('Customer name is required.');
      return;
    }

    setSaving(true);
    setErrorMessage('');
    try {
      await updateWalkIn(walkin.id, {
        customer_name: formData.customer_name,
        mobile_number: formData.mobile_number,
        purpose: formData.purpose,
        car_id: formData.car_id || null,
        fuel_types: formData.fuel_types.length > 0 ? formData.fuel_types : null,
        salesperson_id: formData.salesperson_id || null,
        location_id: formData.location_id || null,
        status: formData.status
      });
      await onSave();
    } catch (error) {
      setErrorMessage(error?.message || 'Unable to save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>Edit Walk-in</h2>

        {errorMessage && <p className="error-text">{errorMessage}</p>}

        {loading ? (
          <p>Loading form data...</p>
        ) : (
          <div className="edit-form">
            <section className="form-section">
              <h3>Customer Information</h3>
              <div className="form-group">
                <label htmlFor="customer_name">Customer Name *</label>
                <input
                  id="customer_name"
                  type="text"
                  className="kiosk-input"
                  value={formData.customer_name}
                  onChange={(e) => handleChange('customer_name', e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label htmlFor="mobile_number">Mobile Number</label>
                <input
                  id="mobile_number"
                  type="tel"
                  className="kiosk-input"
                  value={formData.mobile_number}
                  onChange={(e) => handleChange('mobile_number', e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label htmlFor="purpose">Purpose</label>
                <input
                  id="purpose"
                  type="text"
                  className="kiosk-input"
                  value={formData.purpose}
                  onChange={(e) => handleChange('purpose', e.target.value)}
                  disabled={saving}
                  placeholder="e.g., Test Drive, Inquiry"
                />
              </div>
            </section>

            <section className="form-section">
              <h3>Vehicle & Preferences</h3>
              <div className="form-group">
                <label htmlFor="car_id">Interested Model</label>
                <select
                  id="car_id"
                  className="kiosk-select"
                  value={formData.car_id}
                  onChange={(e) => handleChange('car_id', e.target.value)}
                  disabled={saving}
                >
                  <option value="">Select a model</option>
                  {cars.map((car) => (
                    <option key={car.id} value={car.id}>
                      {car.name || car.model_name || `Model ${car.id}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Fuel Type Preference</label>
                <div className="fuel-options">
                  {FUEL_OPTIONS.map((option) => (
                    <label key={option.value} className="fuel-checkbox">
                      <input
                        type="checkbox"
                        checked={formData.fuel_types.includes(option.value)}
                        onChange={() => handleFuelToggle(option.value)}
                        disabled={saving}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </section>

            <section className="form-section">
              <h3>Assignment</h3>
              <div className="form-group">
                <label htmlFor="location_id">Location</label>
                <select
                  id="location_id"
                  className="kiosk-select"
                  value={formData.location_id}
                  onChange={(e) => handleChange('location_id', e.target.value)}
                  disabled={saving}
                >
                  <option value="">Select a location</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="salesperson_id">Salesperson</label>
                <select
                  id="salesperson_id"
                  className="kiosk-select"
                  value={formData.salesperson_id}
                  onChange={(e) => handleChange('salesperson_id', e.target.value)}
                  disabled={saving}
                >
                  <option value="">Unassigned</option>
                  {salespersons.map((person) => (
                    <option key={person.id} value={person.id}>
                      {getDisplayName(person)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="status">Status</label>
                <select
                  id="status"
                  className="kiosk-select"
                  value={formData.status}
                  onChange={(e) => handleChange('status', e.target.value)}
                  disabled={saving}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </section>
          </div>
        )}

        <div className="kiosk-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || loading}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
