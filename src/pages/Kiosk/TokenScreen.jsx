export default function TokenScreen({ data, waiting, onDone }) {
  if (waiting) {
    return (
      <section className="kiosk-card">
        <h1 className="kiosk-title">Request Submitted</h1>
        <p>Please wait while receptionist assigns advisor.</p>
        <p>
          Customer: <strong>{data.customerName || 'N/A'}</strong>
        </p>
        <p>
          Model: {data.selectedCarName || 'N/A'} | Fuels: {(data.fuelTypes || []).join(', ') || 'N/A'}
        </p>
      </section>
    );
  }

  return (
    <section className="kiosk-card">
      <h1 className="kiosk-title">Your Token Is Ready</h1>
      <p>
        Thank you, <strong>{data.customerName || 'Customer'}</strong>.
      </p>
      <h2>{data.tokenNumber}</h2>
      <p>
        Model: {data.selectedCarName || 'N/A'} | Fuels: {(data.fuelTypes || []).join(', ') || 'N/A'}
      </p>
      <div className="kiosk-actions">
        <button type="button" className="btn btn-primary" onClick={onDone}>
          Finish
        </button>
      </div>
    </section>
  );
}
