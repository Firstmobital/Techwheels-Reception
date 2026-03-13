import { useCallback, useEffect, useMemo, useState } from 'react';
import WelcomeScreen from './WelcomeScreen';
import CustomerDetailsScreen from './CustomerDetailsScreen';
import ModelSelectionScreen from './ModelSelectionScreen';
import FuelSelectionScreen from './FuelSelectionScreen';
import TokenScreen from './TokenScreen';
import {
  createWalkIn,
  detectReturningCustomer,
  getWalkInById
} from '../../services/walkinService';

const KIOSK_STEPS = {
  WELCOME: 1,
  CUSTOMER_DETAILS: 2,
  MODEL_SELECTION: 3,
  FUEL_SELECTION: 4,
  TOKEN: 5
};

const DEFAULT_STATE = {
  purpose: '',
  customerName: '',
  mobileNumber: '',
  selectedCarId: '',
  selectedCarName: '',
  fuelTypes: [],
  walkinId: null,
  tokenNumber: ''
};

export default function KioskContainer() {
  const [step, setStep] = useState(KIOSK_STEPS.WELCOME);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [walkinData, setWalkinData] = useState(DEFAULT_STATE);

  const isWaitingForAssignment = step === KIOSK_STEPS.TOKEN && !walkinData.tokenNumber;

  useEffect(() => {
    if (!isWaitingForAssignment || !walkinData.walkinId) return undefined;

    const poll = async () => {
      try {
        const record = await getWalkInById(walkinData.walkinId);
        if (record?.status === 'assigned' && record?.token_number) {
          setWalkinData((prev) => ({ ...prev, tokenNumber: record.token_number }));
        }
      } catch {
        // Keep polling silently; transient network failures should not break kiosk flow.
      }
    };

    poll();
    const intervalId = window.setInterval(poll, 5000);
    return () => window.clearInterval(intervalId);
  }, [isWaitingForAssignment, walkinData.walkinId]);

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
          saving={saving}
          onBack={() => setStep(KIOSK_STEPS.MODEL_SELECTION)}
          onNext={async (fuelTypes) => {
            setErrorMessage('');
            setSaving(true);
            try {
              const created = await createWalkIn({
                customer_name: walkinData.customerName,
                mobile_number: walkinData.mobileNumber,
                purpose: walkinData.purpose,
                car_id: walkinData.selectedCarId,
                fuel_types: fuelTypes
              });

              setWalkinData((prev) => ({
                ...prev,
                fuelTypes,
                walkinId: created.id,
                tokenNumber: ''
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
        waiting={!walkinData.tokenNumber}
        onDone={resetFlow}
      />
    );
  }, [saving, step, walkinData]);

  return (
    <div className="kiosk-grid">
      {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
      <div key={step} className="step-transition">
        {stepView}
      </div>
    </div>
  );
}