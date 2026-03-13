export default function TokenScreen({ data, onDone }) {
  return (
    <section className="kiosk-card mx-auto w-full max-w-[600px] rounded-2xl p-6 text-center shadow-lg">
      <h1 className="kiosk-title !mb-1 text-4xl">Your Token Is Ready</h1>
      <p className="text-base text-slate-600">
        Thank you, <strong>{data.customerName || 'Customer'}</strong>.
      </p>

      <div className="mx-auto mt-5 grid w-full gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Token Number</p>
          <h2 className="token-number text-6xl">{data.tokenNumber || 'N/A'}</h2>
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Salesperson Name</p>
          <p className="text-2xl font-bold text-slate-800">{data.salespersonName || 'N/A'}</p>
        </div>
      </div>

      <p className="mt-5 text-base text-slate-600">
        Model: {data.selectedCarName || 'N/A'} | Fuels: {(data.fuelTypes || []).join(', ') || 'N/A'}
      </p>
      <div className="kiosk-actions mt-4 justify-center">
        <button
          type="button"
          className="btn h-20 rounded-2xl bg-gradient-to-r from-blue-700 via-sky-600 to-cyan-500 text-white shadow-lg"
          onClick={onDone}
        >
          Finish
        </button>
      </div>
    </section>
  );
}
