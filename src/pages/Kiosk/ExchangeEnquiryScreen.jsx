export default function ExchangeEnquiryScreen({ onBack, onNext, submitting }) {
  return (
    <section className="kiosk-card mx-auto w-full max-w-[600px] rounded-2xl p-6 shadow-lg">
      <h1 className="kiosk-title !mb-1 text-center text-4xl">Vehicle Exchange</h1>
      <p className="mb-6 text-center text-base text-slate-600">
        Do you have a vehicle to exchange?
      </p>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          className="h-20 w-full rounded-2xl border-2 border-blue-600 bg-blue-50 text-blue-700 text-xl font-semibold"
          onClick={() => onNext({ isExchangeEnquiry: true })}
          disabled={submitting}
        >
          Yes, I have a vehicle to exchange
        </button>
        <button
          type="button"
          className="h-20 w-full rounded-2xl border border-slate-200 bg-white text-slate-700 text-xl font-semibold"
          onClick={() => onNext({ isExchangeEnquiry: false })}
          disabled={submitting}
        >
          No, continue without exchange
        </button>
      </div>

      <div className="kiosk-actions mt-4">
        <button
          type="button"
          className="btn btn-secondary h-14 rounded-2xl"
          onClick={onBack}
          disabled={submitting}
        >
          Back
        </button>
      </div>
    </section>
  );
}