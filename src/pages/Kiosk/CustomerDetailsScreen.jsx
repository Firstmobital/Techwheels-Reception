import { useState } from 'react';

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

  return (
    <section className="kiosk-card">
      <h1 className="kiosk-title">Customer Details</h1>
      <p>Purpose: <strong>{data.purpose || 'Not selected'}</strong></p>

      <form className="kiosk-grid" onSubmit={handleSubmit}>
        <label>
          Name
          <input
            className="kiosk-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Enter your name"
          />
        </label>

        <label>
          Mobile
          <input
            className="kiosk-input"
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
          />
        </label>

        {checking ? <p>Checking previous visits...</p> : null}
        {checkError ? <p className="error-text">{checkError}</p> : null}

        {returningCustomer ? (
          <div className="returning-card">
            <h3>Returning Customer Found</h3>
            <p>Customer Name: <strong>{returningCustomer.customer_name || 'N/A'}</strong></p>
            <p>Last Model: <strong>{returningCustomer.last_model || 'N/A'}</strong></p>
            <p>Last Salesperson: <strong>{returningCustomer.last_salesperson || 'N/A'}</strong></p>

            <div className="kiosk-actions">
              <button
                type="button"
                className={enquiryChoice === 'continue' ? 'btn btn-primary' : 'btn btn-secondary'}
                onClick={() => setEnquiryChoice('continue')}
              >
                Continue
              </button>
              <button
                type="button"
                className={enquiryChoice === 'new' ? 'btn btn-primary' : 'btn btn-secondary'}
                onClick={() => setEnquiryChoice('new')}
              >
                New Enquiry
              </button>
            </div>
          </div>
        ) : null}

        <div className="kiosk-actions">
          <button type="button" className="btn btn-secondary" onClick={onBack}>
            Back
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={checking || (returningCustomer && !enquiryChoice)}
          >
            Continue
          </button>
        </div>
      </form>
    </section>
  );
}
