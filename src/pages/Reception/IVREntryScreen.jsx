import { useEffect, useMemo, useState } from 'react';
import { createIVRLead } from '../../services/ivrService';
import {
  getAvailableCars,
  getLocations,
  getSalesPersonsByLocation
} from '../../services/walkinService';

const INITIAL_FORM = {
  customerName: '',
  mobileNumber: '',
  modelName: '',
  locationId: '',
  salespersonId: '',
  remarks: ''
};

function getDisplayName(person) {
  const firstName = person?.first_name?.trim() || '';
  const lastName = person?.last_name?.trim() || '';
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || 'Unnamed advisor';
}

export default function IVREntryScreen() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [cars, setCars] = useState([]);
  const [locations, setLocations] = useState([]);
  const [salespersons, setSalespersons] = useState([]);
  const [loadingCars, setLoadingCars] = useState(true);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [loadingSalespersons, setLoadingSalespersons] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const isValidMobileNumber = /^\d{10}$/.test(form.mobileNumber.trim());

  useEffect(() => {
    let mounted = true;

    const loadCars = async () => {
      setLoadingCars(true);
      setErrorMessage('');
      try {
        const data = await getAvailableCars();
        if (mounted) {
          setCars((data || []).filter((car) => car?.name?.trim()));
        }
      } catch (error) {
        if (mounted) {
          setErrorMessage(error?.message || 'Unable to load car models.');
        }
      } finally {
        if (mounted) {
          setLoadingCars(false);
        }
      }
    };

    loadCars();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadLocations = async () => {
      setLoadingLocations(true);
      setErrorMessage('');
      try {
        const data = await getLocations();
        if (mounted) {
          setLocations(data || []);
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
      if (!form.locationId) {
        setSalespersons([]);
        setForm((prev) => ({ ...prev, salespersonId: '' }));
        return;
      }

      setLoadingSalespersons(true);
      setErrorMessage('');
      try {
        const data = await getSalesPersonsByLocation(form.locationId);
        if (mounted) {
          setSalespersons(data || []);
          setForm((prev) => ({ ...prev, salespersonId: '' }));
        }
      } catch (error) {
        if (mounted) {
          setErrorMessage(error?.message || 'Unable to load sales advisors.');
          setSalespersons([]);
          setForm((prev) => ({ ...prev, salespersonId: '' }));
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
  }, [form.locationId]);

  const isFormValid = useMemo(
    () =>
      Boolean(
        form.customerName.trim() &&
          isValidMobileNumber &&
          form.modelName.trim() &&
          form.locationId &&
          form.remarks.trim()
      ),
    [form, isValidMobileNumber]
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.customerName.trim()) {
      setErrorMessage('Please enter customer name.');
      return;
    }
    if (!isValidMobileNumber) {
      setErrorMessage('Please enter a valid 10-digit mobile number.');
      return;
    }
    if (!form.modelName.trim()) {
      setErrorMessage('Please select model name.');
      return;
    }
    if (!form.locationId) {
      setErrorMessage('Please select branch.');
      return;
    }
    if (!form.remarks.trim()) {
      setErrorMessage('Please enter remarks.');
      return;
    }

    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await createIVRLead({
        customer_name: form.customerName.trim(),
        mobile_number: form.mobileNumber.trim(),
        model_name: form.modelName.trim(),
        salesperson_id: form.salespersonId || null,
        location_id: form.locationId,
        remarks: form.remarks.trim()
      });

      setForm(INITIAL_FORM);
      setSalespersons([]);
      setSuccessMessage('IVR lead saved and sent to AI nurturing queue.');
    } catch (error) {
      setErrorMessage(error?.message || 'Unable to save IVR lead.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="kiosk-card mx-auto w-full max-w-[820px] rounded-2xl p-6 shadow-lg">
      <h1 className="kiosk-title !mb-1 text-4xl">IVR Lead Entry</h1>
      <p className="mb-5 text-base text-slate-600">Capture IVR call leads and assign them to a branch and advisor.</p>

      {errorMessage ? <p className="error-text mb-4">{errorMessage}</p> : null}
      {successMessage ? <p className="mb-4 text-green-700">{successMessage}</p> : null}

      <form className="ivr-entry-grid" onSubmit={handleSubmit} noValidate>
        <label className="text-lg font-semibold text-slate-700" htmlFor="ivr-customer-name">
          Customer Name
          <input
            id="ivr-customer-name"
            className="kiosk-input mt-2"
            type="text"
            value={form.customerName}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, customerName: event.target.value }));
              setSuccessMessage('');
            }}
            placeholder="Enter customer name"
            required
          />
        </label>

        <label className="text-lg font-semibold text-slate-700" htmlFor="ivr-mobile-number">
          Mobile Number
          <input
            id="ivr-mobile-number"
            className="kiosk-input mt-2"
            type="tel"
            inputMode="numeric"
            pattern="[0-9]{10}"
            minLength={10}
            maxLength={10}
            value={form.mobileNumber}
            onChange={(event) => {
              const value = event.target.value.replace(/\D/g, '').slice(0, 10);
              setForm((prev) => ({ ...prev, mobileNumber: value }));
              setSuccessMessage('');
            }}
            placeholder="Enter mobile number"
            required
          />
        </label>

        <label
          className="ivr-span-2 text-lg font-semibold text-slate-700"
          htmlFor="ivr-model-name"
        >
          Model Name
          <select
            id="ivr-model-name"
            className="kiosk-select mt-2"
            value={form.modelName}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, modelName: event.target.value }));
              setSuccessMessage('');
            }}
            disabled={loadingCars || saving}
            required
          >
            <option value="">{loadingCars ? 'Loading models...' : 'Select Model'}</option>
            {cars.map((car) => (
              <option key={car.id} value={car.name}>
                {car.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-lg font-semibold text-slate-700" htmlFor="ivr-branch">
          Branch
          <select
            id="ivr-branch"
            className="kiosk-select mt-2"
            value={form.locationId}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, locationId: event.target.value }));
              setErrorMessage('');
              setSuccessMessage('');
            }}
            required
            disabled={loadingLocations || saving}
          >
            <option value="">{loadingLocations ? 'Loading branches...' : 'Select branch'}</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name || `Branch #${location.id}`}
              </option>
            ))}
          </select>
        </label>

        <label className="text-lg font-semibold text-slate-700" htmlFor="ivr-sales-advisor">
          Sales Advisor
          <select
            id="ivr-sales-advisor"
            className="kiosk-select mt-2"
            value={form.salespersonId}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, salespersonId: event.target.value }));
              setErrorMessage('');
              setSuccessMessage('');
            }}
            disabled={!form.locationId || loadingSalespersons || saving}
          >
            <option value="">
              {!form.locationId
                ? 'Select branch first'
                : loadingSalespersons
                  ? 'Loading advisors...'
                  : 'Select sales advisor (optional)'}
            </option>
            {salespersons.map((person) => (
              <option key={person.id} value={person.id}>
                {getDisplayName(person)}
              </option>
            ))}
          </select>
        </label>

        <label
          className="ivr-span-2 text-lg font-semibold text-slate-700"
          htmlFor="ivr-remarks"
        >
          Remarks
          <textarea
            id="ivr-remarks"
            className="kiosk-input mt-2 min-h-[140px]"
            value={form.remarks}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, remarks: event.target.value }));
              setSuccessMessage('');
            }}
            placeholder="Add call notes"
            required
          />
        </label>

        <div className="ivr-span-2 kiosk-actions justify-end" style={{ marginTop: '0.5rem' }}>
          <button
            type="submit"
            className="btn h-16 rounded-2xl bg-gradient-to-r from-blue-700 via-sky-600 to-cyan-500 text-white shadow-lg"
            disabled={!isFormValid || saving || loadingCars || loadingLocations || loadingSalespersons}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </section>
  );
}