export default function ExchangeEnquiryScreen({
  onBack,
  onNext,
  submitting
}) {
  return (
    <section className="kiosk-card mx-auto w-full max-w-[750px] h-[92vh] flex flex-col rounded-2xl p-6 text-center shadow-lg">
      <h1 className="kiosk-title !mb-3 text-4xl">Vehicle Exchange</h1>
      <p className="mb-8 text-lg text-slate-600">
        Do you have a vehicle to exchange?
      </p>

      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        <div className="text-5xl">🚗</div>
      </div>

      <div className="kiosk-actions mt-4 justify-center gap-4">
        <button
          type="button"
          className="btn btn-secondary h-20 rounded-2xl"
          onClick={onBack}
          disabled={submitting}
        >
          Back
        </button>
        <button
          type="button"
          className="btn h-20 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 text-white shadow-lg text-xl font-semibold"
          onClick={() => onNext({ isExchangeEnquiry: true })}
          disabled={submitting}
        >
          Yes, I have a car to exchange
        </button>
        <button
          type="button"
          className="btn h-20 rounded-2xl bg-gradient-to-r from-slate-500 via-slate-600 to-slate-700 text-white shadow-lg text-xl font-semibold"
          onClick={() => onNext({ isExchangeEnquiry: false })}
          disabled={submitting}
        >
          No, I don't have a car to exchange
        </button>
      </div>
    </section>
  );
}
