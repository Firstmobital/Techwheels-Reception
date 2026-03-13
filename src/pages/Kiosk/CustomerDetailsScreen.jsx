import { useState } from 'react';

const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'DEL'];

export default function CustomerDetailsScreen({ data, onNext, onBack, onCheckMobile }) {
  const [name, setName] = useState(data.name || '');
  const [mobile, setMobile] = useState(data.mobile || '');
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');
  const [returningCustomer, setReturningCustomer] = useState(null);
  const [enquiryChoice, setEnquiryChoice] = useState('');

  const checkReturningCustomer = async (rawMobile) => {
    const normalizedMobile = rawMobile.trim();
    if (!normalizedMobile || normalizedMobile.length < 10) {
      setReturningCustomer(null);
      setEnquiryChoice('');
      return;
    }

    if (!onCheckMobile) return;

    setChecking(true);
    setCheckError('');
    try {
      const previousVisit = await onCheckMobile(normalizedMobile);
      setReturningCustomer(previousVisit || null);
      setEnquiryChoice(previousVisit ? '' : 'new');
      if (previousVisit && !name.trim() && previousVisit.customer_name) {
        setName(previousVisit.customer_name);
      }
    } catch (error) {
      setCheckError(error?.message || 'Unable to check returning customer now.');
    } finally {
      setChecking(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (returningCustomer && !enquiryChoice) return;
    if (!name.trim() || !mobile.trim()) return;
    onNext({ name: name.trim(), mobile: mobile.trim() });
  };

  const handleKeypadPress = (key) => {
    if (key === 'CLR') {
      setMobile('');
      setReturningCustomer(null);
      setEnquiryChoice('');
      return;
    }

    if (key === 'DEL') {
      setMobile((prev) => prev.slice(0, -1));
      return;
    }

    setMobile((prev) => `${prev}${key}`.slice(0, 10));
  };

  return (
    <section className="kiosk-card mx-auto w-full max-w-[600px] rounded-2xl p-6 shadow-lg">
      <h1 className="kiosk-title !mb-1 text-center text-4xl">Customer Details</h1>
      <p className="mb-5 text-center text-base text-slate-600">
        Purpose: <strong>{data.purpose || 'Not selected'}</strong>
      </p>

      <form className="kiosk-grid gap-4" onSubmit={handleSubmit}>
        <label className="text-lg font-semibold text-slate-700">
          Full Name
          <input
            className="kiosk-input mt-2 rounded-2xl text-xl"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Enter your name"
          />
        </label>

        <label className="text-lg font-semibold text-slate-700">
          Mobile Number
          <input
            className="kiosk-input mt-2 rounded-2xl text-center text-2xl tracking-widest"
            value={mobile}
            autoFocus
            onChange={(event) => {
              const value = event.target.value;
              setMobile(value);
              setCheckError('');
              setEnquiryChoice('');
              if (!value.trim()) {
                setReturningCustomer(null);
              }
            }}
            onBlur={() => checkReturningCustomer(mobile)}
            placeholder="Enter mobile number"
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            readOnly
          />
        </label>

        <div className="grid grid-cols-3 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-inner">
          {KEYPAD_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className={`h-20 rounded-2xl text-2xl font-bold shadow-sm ${
                key === 'CLR' || key === 'DEL'
                  ? 'bg-white text-slate-700'
                  : 'bg-gradient-to-r from-blue-700 via-sky-600 to-cyan-500 text-white'
              }`}
              onClick={() => handleKeypadPress(key)}
            >
              {key}
            </button>
          ))}
        </div>

        {checking ? <p>Checking previous visits...</p> : null}
        {checkError ? <p className="error-text">{checkError}</p> : null}

        {returningCustomer ? (
          <div className="returning-card rounded-2xl">
            <h3>Returning Customer Found</h3>
            <p>Customer Name: <strong>{returningCustomer.customer_name || 'N/A'}</strong></p>
            <p>Last Model: <strong>{returningCustomer.last_model || 'N/A'}</strong></p>
            <p>Last Salesperson: <strong>{returningCustomer.last_salesperson || 'N/A'}</strong></p>

            <div className="kiosk-actions">
              <button
                type="button"
                className={enquiryChoice === 'continue' ? 'btn h-20 rounded-2xl bg-gradient-to-r from-blue-700 via-sky-600 to-cyan-500 text-white shadow-lg' : 'btn btn-secondary h-20 rounded-2xl'}
                onClick={() => setEnquiryChoice('continue')}
              >
                Continue
              </button>
              <button
                type="button"
                className={enquiryChoice === 'new' ? 'btn h-20 rounded-2xl bg-gradient-to-r from-blue-700 via-sky-600 to-cyan-500 text-white shadow-lg' : 'btn btn-secondary h-20 rounded-2xl'}
                onClick={() => setEnquiryChoice('new')}
              >
                New Enquiry
              </button>
            </div>
          </div>
        ) : null}

        <div className="kiosk-actions mt-2 justify-center">
          <button type="button" className="btn btn-secondary h-20 rounded-2xl" onClick={onBack}>
            Back
          </button>
          <button
            type="submit"
            className="btn h-20 rounded-2xl bg-gradient-to-r from-blue-700 via-sky-600 to-cyan-500 text-white shadow-lg"
            disabled={checking || (returningCustomer && !enquiryChoice)}
          >
            Continue
          </button>
        </div>
      </form>
    </section>
  );
}
