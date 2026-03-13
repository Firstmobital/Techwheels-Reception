const PURPOSE_OPTIONS = [
  {
    label: 'I want to buy a car',
    value: 'Buy Car',
    gradient: 'from-[#3463E6] to-[#2750C8]',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 13h1l2-5h12l2 5h1" />
        <path d="M5 13v3h2" />
        <path d="M17 16h2v-3" />
        <circle cx="8" cy="16" r="1.5" />
        <circle cx="16" cy="16" r="1.5" />
      </svg>
    )
  },
  {
    label: 'Test Drive',
    value: 'Test Drive',
    gradient: 'from-[#21A7E8] to-[#117DB9]',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3a9 9 0 1 0 9 9" />
        <path d="M12 12l5-3" />
      </svg>
    )
  },
  {
    label: 'Exchange Enquiry',
    value: 'Exchange',
    gradient: 'from-[#6A6DE9] to-[#4F45D7]',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 7h12" />
        <path d="M12 3l4 4-4 4" />
        <path d="M20 17H8" />
        <path d="M12 13l-4 4 4 4" />
      </svg>
    )
  },
  {
    label: 'Accessories',
    value: 'Accessories',
    gradient: 'from-[#8F58F1] to-[#7437DD]',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14.7 6.3l3 3" />
        <path d="M6.3 14.7l3 3" />
        <path d="M5 19l6.5-6.5" />
        <path d="M12.5 11.5L19 5" />
      </svg>
    )
  },
  {
    label: 'Just Exploring',
    value: 'Exploring',
    gradient: 'from-[#6C7A92] to-[#4E5A72]',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z" />
        <circle cx="12" cy="12" r="2" />
      </svg>
    )
  }
];

export default function WelcomeScreen({ onSelectPurpose }) {
  return (
    <section className="mx-auto w-full max-w-[500px] px-2 py-6 text-center md:max-w-[560px]">
      <div className="mb-6 flex flex-col items-center">
        <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-[#224B8E] text-2xl font-bold text-white shadow-lg">
          T
        </div>

        <h1 className="leading-[1.1] text-[40px] font-extrabold text-[#1F3F78] md:text-[48px]">
          Welcome to
          <br />
          Techwheels
        </h1>

        <p className="mt-3 text-[20px] font-medium text-[#8D9CB1] md:text-[24px]">How can we help you today?</p>
      </div>

      <div className="grid gap-3">
        {PURPOSE_OPTIONS.map((purpose) => (
          <button
            key={purpose.label}
            type="button"
            className={`flex h-20 w-full items-center gap-4 rounded-2xl bg-gradient-to-r ${purpose.gradient} px-5 text-left text-[22px] font-semibold text-white shadow-lg md:text-[25px]`}
            onClick={() => onSelectPurpose(purpose.value)}
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/20 text-white">
              {purpose.icon}
            </span>
            <span>{purpose.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
