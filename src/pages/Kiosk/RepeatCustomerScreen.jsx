export default function RepeatCustomerScreen({
  mobileNumber,
  returningCustomer,
  processing,
  onContinueSamePurpose,
  onChooseDifferentPurpose
}) {
  return (
    <section className="kiosk-card mx-auto w-full max-w-[600px] rounded-2xl p-6 text-center shadow-lg">
      
      <h1 className="kiosk-title !mb-1 text-4xl">Welcome Back!</h1>
      <p className="mb-5 text-2xl font-semibold text-slate-700">
        +91 {mobileNumber}
      </p>

      <div className="mx-auto mt-2 grid w-full gap-4 rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-lg">
        
        {/* Previous Interest */}
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Last Visit
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Previous Interest
          </p>
          <p className="text-2xl font-bold text-slate-800">
            {returningCustomer?.last_purpose || 'N/A'}
          </p>
        </div>

        {/* Last Model */}
        {returningCustomer?.last_model && (
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Last Model
            </p>
            <p className="text-xl font-semibold text-slate-800">
              {returningCustomer.last_model}
            </p>
          </div>
        )}

        {/* Last Sales Advisor */}
        {returningCustomer?.last_salesperson && (
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Last Sales Advisor
            </p>
            <p className="text-xl font-semibold text-slate-800">
              {returningCustomer.last_salesperson}
            </p>
          </div>
        )}

        {/* Visit Count */}
        <p className="text-lg font-medium text-slate-700">
          You've visited us{" "}
          <strong>{returningCustomer?.visit_count || 0}</strong> times before.
        </p>

      </div>

      <div className="kiosk-grid mt-5 gap-3">
        <button
          type="button"
          className="btn h-20 rounded-2xl bg-gradient-to-r from-blue-700 via-sky-600 to-cyan-500 text-white shadow-lg"
          onClick={onContinueSamePurpose}
          disabled={processing}
        >
          {processing ? 'Processing...' : 'Continue with Same Purpose'}
        </button>

        <button
          type="button"
          className="btn btn-secondary h-20 rounded-2xl"
          onClick={onChooseDifferentPurpose}
          disabled={processing}
        >
          Choose Different Purpose
        </button>
      </div>

    </section>
  );
}