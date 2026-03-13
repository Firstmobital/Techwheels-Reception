import { useState } from 'react';

const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'DEL'];

export default function CustomerDetailsScreen({ data, onNext, onBack, onCheckMobile }) {
  const [name, setName] = useState(data.name || '');
  const [mobile, setMobile] = useState(data.mobile || '');
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');
  const [returningCustomer, setReturningCustomer] = useState(null);

  const checkReturningCustomer = async (rawMobile) => {
    const normalizedMobile = rawMobile.trim();
    if (!normalizedMobile || normalizedMobile.length < 10) {
      setReturningCustomer(null);
      return null;
    }

    if (!onCheckMobile) return null;

    setChecking(true);
    setCheckError('');
    try {
      const previousVisit = await onCheckMobile(normalizedMobile);
      setReturningCustomer(previousVisit || null);
      if (previousVisit && !name.trim() && previousVisit.customer_name) {
        setName(previousVisit.customer_name);
      }
      return previousVisit || null;
    } catch (error) {
      setCheckError(error?.message || 'Unable to check returning customer now.');
      return null;
    } finally {
      setChecking(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!name.trim() || !mobile.trim()) return;

    let previousVisit = returningCustomer;
    if (!previousVisit && mobile.trim().length >= 10) {
      previousVisit = await checkReturningCustomer(mobile);
    }

    onNext({
      name: name.trim(),
      mobile: mobile.trim(),
      returningCustomer: previousVisit?.visit_count > 0 ? previousVisit : null
    });
  };

  const handleKeypadPress = (key) => {
    if (key === 'CLR') {
      setMobile('');
      setReturningCustomer(null);
      return;
    }

    if (key === 'DEL') {
      setMobile((prev) => prev.slice(0, -1));
      return;
    }

    setMobile((prev) => (prev + key).slice(0, 10));
  };

  return (
    <section className="kiosk-card mx-auto h-[92vh] max-h-[92vh] w-full max-w-[900px] rounded-2xl p-5 shadow-lg">
      <form className="flex h-full min-h-0 flex-col justify-between gap-3" onSubmit={handleSubmit}>
        <div className="kiosk-grid shrink-0 gap-3">
          <h1 className="kiosk-title !mb-1 text-center text-4xl">Customer Details</h1>
          <p className="mb-1 text-center text-base text-slate-600">
            Purpose: <strong>{data.purpose || 'Not selected'}</strong>
          </p>

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
        </div>

        <div className="min-h-0 flex-1">
          <div className="mx-auto w-full max-w-[440px]">
            <div className="grid w-full grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 shadow-inner">
              {KEYPAD_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={
                    'h-12 w-full rounded-2xl text-2xl font-bold shadow-sm ' +
                    (key === 'CLR' || key === 'DEL'
                      ? 'bg-white text-slate-700'
                      : 'bg-gradient-to-r from-blue-700 via-sky-600 to-cyan-500 text-white')
                  }
                  onClick={() => handleKeypadPress(key)}
                >
                  {key}
                </button>
              ))}
            </div>

            {checking ? <p>Checking previous visits...</p> : null}
            {checkError ? <p className="error-text">{checkError}</p> : null}
          </div>
        </div>

        <div className="kiosk-actions shrink-0 justify-center pt-1">
          <button type="button" className="btn btn-secondary h-14 rounded-2xl" onClick={onBack}>
            Back
          </button>
          <button
            type="submit"
            className="btn h-14 rounded-2xl bg-gradient-to-r from-blue-700 via-sky-600 to-cyan-500 text-white shadow-lg"
            disabled={checking}
          >
            Continue
          </button>
        </div>
      </form>
    </section>
  );
}
