import { useCallback, useEffect, useMemo, useState } from 'react';
import WelcomeScreen from './WelcomeScreen';
import CustomerDetailsScreen from './CustomerDetailsScreen';
import ModelSelectionScreen from './ModelSelectionScreen';
import FuelSelectionScreen from './FuelSelectionScreen';
import SalespersonSelectionScreen from './SalespersonSelectionScreen';
import TokenScreen from './TokenScreen';
import {
  createWalkIn,
  detectReturningCustomer
} from '../../services/walkinService';

const KIOSK_STEPS = {
  WELCOME: 1,
  CUSTOMER_DETAILS: 2,
  MODEL_SELECTION: 3,
  FUEL_SELECTION: 4,
  SALESPERSON_SELECTION: 5,
  TOKEN: 6
};

const DEFAULT_STATE = {
  purpose: '',
  customerName: '',
  mobileNumber: '',
  selectedCarId: '',
  selectedCarName: '',
  fuelTypes: [],
  salespersonId: '',
  salespersonName: '',
  walkinId: null,
  tokenNumber: ''
};

export default function KioskContainer() {
  const [step, setStep] = useState(KIOSK_STEPS.WELCOME);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [walkinData, setWalkinData] = useState(DEFAULT_STATE);

  const resetFlow = useCallback(() => {
    setWalkinData(DEFAULT_STATE);
    setErrorMessage('');
    setSaving(false);
    setStep(KIOSK_STEPS.WELCOME);
  }, []);

  useEffect(() => {
    const shouldAutoReset = step === KIOSK_STEPS.TOKEN && Boolean(walkinData.tokenNumber);
    if (!shouldAutoReset) return undefined;

    const timeoutId = window.setTimeout(() => {
      resetFlow();
    }, 10000);

    return () => window.clearTimeout(timeoutId);
  }, [resetFlow, step, walkinData.tokenNumber]);

  const stepView = useMemo(() => {
    if (step === KIOSK_STEPS.WELCOME) {
      return (
        <WelcomeScreen
          onSelectPurpose={(purpose) => {
            setWalkinData((prev) => ({ ...prev, purpose }));
            setStep(KIOSK_STEPS.CUSTOMER_DETAILS);
          }}
        />
      );
    }

    if (step === KIOSK_STEPS.CUSTOMER_DETAILS) {
      return (
        <CustomerDetailsScreen
          data={{
            name: walkinData.customerName,
            mobile: walkinData.mobileNumber,
            purpose: walkinData.purpose
          }}
          onCheckMobile={detectReturningCustomer}
          onBack={() => setStep(KIOSK_STEPS.WELCOME)}
          onNext={({ name, mobile }) => {
            setWalkinData((prev) => ({
              ...prev,
              customerName: name,
              mobileNumber: mobile
            }));
            setStep(KIOSK_STEPS.MODEL_SELECTION);
          }}
        />
      );
    }

    if (step === KIOSK_STEPS.MODEL_SELECTION) {
      return (
        <ModelSelectionScreen
          selectedModelId={walkinData.selectedCarId}
          onBack={() => setStep(KIOSK_STEPS.CUSTOMER_DETAILS)}
          onNext={({ carId, carName }) => {
            setWalkinData((prev) => ({
              ...prev,
              selectedCarId: carId,
              selectedCarName: carName
            }));
            setStep(KIOSK_STEPS.FUEL_SELECTION);
          }}
        />
      );
    }

    if (step === KIOSK_STEPS.FUEL_SELECTION) {
      return (
        <FuelSelectionScreen
          selectedFuels={walkinData.fuelTypes}
          onBack={() => setStep(KIOSK_STEPS.MODEL_SELECTION)}
          onNext={(fuelTypes) => {
            setErrorMessage('');
            setWalkinData((prev) => ({
              ...prev,
              fuelTypes
            }));
            setStep(KIOSK_STEPS.SALESPERSON_SELECTION);
          }}
        />
      );
    }

    if (step === KIOSK_STEPS.SALESPERSON_SELECTION) {
      return (
        <SalespersonSelectionScreen
          selectedSalespersonId={walkinData.salespersonId}
          submitting={saving}
          onBack={() => setStep(KIOSK_STEPS.FUEL_SELECTION)}
          onNext={async ({ salespersonId, salespersonName }) => {
            setErrorMessage('');
            setSaving(true);
            try {
              const created = await createWalkIn({
                customer_name: walkinData.customerName,
                mobile_number: walkinData.mobileNumber,
                purpose: walkinData.purpose,
                car_id: walkinData.selectedCarId,
                fuel_types: walkinData.fuelTypes,
                salesperson_id: salespersonId
              });

              setWalkinData((prev) => ({
                ...prev,
                salespersonId,
                salespersonName,
                walkinId: created.id,
                tokenNumber: created.token_number || ''
              }));
              setStep(KIOSK_STEPS.TOKEN);
            } catch (error) {
              setErrorMessage(error?.message || 'Unable to create walk-in. Please try again.');
            } finally {
              setSaving(false);
            }
          }}
        />
      );
    }

    return (
      <TokenScreen
        data={walkinData}
        onDone={resetFlow}
      />
    );
  }, [saving, step, walkinData]);

  return (
    <div className="kiosk-grid mx-auto w-full max-w-[600px]">
      {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
      <div key={step} className="step-transition">
        {stepView}
      </div>
    </div>
  );
}