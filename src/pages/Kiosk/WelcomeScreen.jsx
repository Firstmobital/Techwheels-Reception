const PURPOSE_OPTIONS = ['Buy Car', 'Test Drive', 'Exchange', 'Accessories', 'Exploring'];

export default function WelcomeScreen({ onSelectPurpose }) {
  return (
    <section className="kiosk-card">
      <h1 className="kiosk-title">Welcome to Techwheels</h1>
      <p>Please choose your purpose to continue.</p>

      <div className="purpose-grid">
        {PURPOSE_OPTIONS.map((purpose) => (
          <button
            key={purpose}
            type="button"
            className="btn btn-purpose"
            onClick={() => onSelectPurpose(purpose)}
          >
            {purpose}
          </button>
        ))}
      </div>
    </section>
  );
}
