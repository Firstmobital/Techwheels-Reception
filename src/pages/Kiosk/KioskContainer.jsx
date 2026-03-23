import { useCallback, useEffect, useMemo, useState } from 'react';
import WelcomeScreen from './WelcomeScreen';
import CustomerDetailsScreen from './CustomerDetailsScreen';
import RepeatCustomerScreen from './RepeatCustomerScreen';
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
  REPEAT_CUSTOMER: 3,
  MODEL_SELECTION: 4,
  FUEL_SELECTION: 5,
  SALESPERSON_SELECTION: 6,
  TOKEN: 7
};

const DEFAULT_STATE = {
  purpose: '',
  customerName: '',
  mobileNumber: '',
  selectedCarId: '',
  selectedCarName: '',
  fuelTypes: [],
  selectedLocationId: '',
  selectedLocationName: '',
  salespersonId: '',
  salespersonName: '',
  walkinId: null,
  tokenNumber: '',
  returningCustomer: null
};

function normalizeFuelSelection(fuelValue) {
  if (Array.isArray(fuelValue)) return fuelValue;
  if (typeof fuelValue === 'string' && fuelValue.trim()) {
    return fuelValue
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function logKioskTest(flow, message, details = {}) {
  console.info(`[KIOSK TEST][${flow}] ${message}`, details);
}

export default function KioskContainer() {
  const [step, setStep] = useState(KIOSK_STEPS.WELCOME);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [walkinData, setWalkinData] = useState(DEFAULT_STATE);
  const [repeatFlowAction, setRepeatFlowAction] = useState(null);

  const resetFlow = useCallback(() => {
    setWalkinData(DEFAULT_STATE);
    setRepeatFlowAction(null);
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
          onNext={({ name, mobile, returningCustomer }) => {
            setWalkinData((prev) => ({
              ...prev,
              customerName: name,
              mobileNumber: mobile,
              returningCustomer: returningCustomer || null
            }));

            if (returningCustomer?.visit_count > 0) {
              console.assert(returningCustomer.visit_count > 0, '[KIOSK TEST][REPEAT] visit_count should be greater than 0.');
              logKioskTest('REPEAT', 'Repeat screen displayed after mobile entry.', {
                mobile,
                visitCount: returningCustomer.visit_count
              });
              setStep(KIOSK_STEPS.REPEAT_CUSTOMER);
              return;
            }

            console.assert(!returningCustomer, '[KIOSK TEST][NEW] Repeat screen should not appear for new customer.');
            logKioskTest('NEW', 'Repeat screen skipped for new customer.', { mobile });
            setRepeatFlowAction(null);
            setStep(KIOSK_STEPS.MODEL_SELECTION);
          }}
        />
      );
    }

    if (step === KIOSK_STEPS.REPEAT_CUSTOMER) {
      return (
        <RepeatCustomerScreen
          mobileNumber={walkinData.mobileNumber}
          returningCustomer={walkinData.returningCustomer}
          processing={saving}
          onContinueSamePurpose={async () => {
            const repeatData = walkinData.returningCustomer;
            if (!repeatData) return;

            setErrorMessage('');
            setSaving(true);
            try {
              const selectedFuelTypes = normalizeFuelSelection(repeatData.fuel_type);
              const selectedPurpose = repeatData.purpose || repeatData.last_purpose || walkinData.purpose;
              const created = await createWalkIn({
                customer_name: walkinData.customerName,
                mobile_number: walkinData.mobileNumber,
                purpose: selectedPurpose,
                car_id: repeatData.car_id,
                fuel_type: repeatData.fuel_type,
                fuel_types: selectedFuelTypes,
                salesperson_id: repeatData.salesperson_id,
                location_id: repeatData.location_id || null
              });

              console.assert(Boolean(created?.token_number), '[KIOSK TEST][REPEAT] Token should be generated for repeat customer.');
              console.assert(Boolean(created?.id), '[KIOSK TEST][REPEAT] Walk-in record should be saved.');

              setWalkinData((prev) => ({
                ...prev,
                purpose: selectedPurpose,
                selectedCarId: repeatData.car_id || '',
                selectedCarName: repeatData.last_model || '',
                fuelTypes: selectedFuelTypes,
                salespersonId: repeatData.salesperson_id || '',
                salespersonName: repeatData.last_salesperson || '',
                walkinId: created.id,
                tokenNumber: created.token_number || ''
              }));

              logKioskTest('REPEAT', 'Continue with same purpose generated token and saved walk-in.', {
                mobile: walkinData.mobileNumber,
                token: created.token_number,
                walkinId: created.id
              });
              setRepeatFlowAction(null);
              setStep(KIOSK_STEPS.TOKEN);
            } catch (error) {
              setErrorMessage(error?.message || 'Unable to create walk-in. Please try again.');
            } finally {
              setSaving(false);
            }
          }}
          onChangeSalesperson={() => {
            const repeatData = walkinData.returningCustomer;
            if (!repeatData) return;

            const selectedFuelTypes = normalizeFuelSelection(repeatData.fuel_type);
            const selectedPurpose = repeatData.purpose || repeatData.last_purpose || walkinData.purpose;

            setErrorMessage('');
            setWalkinData((prev) => ({
              ...prev,
              purpose: selectedPurpose,
              selectedCarId: repeatData.car_id || '',
              selectedCarName: repeatData.last_model || '',
              fuelTypes: selectedFuelTypes,
              selectedLocationId: repeatData.location_id || '',
              selectedLocationName: '',
              salespersonId: '',
              salespersonName: ''
            }));
            setRepeatFlowAction('change_salesperson');
            setStep(KIOSK_STEPS.SALESPERSON_SELECTION);
          }}
          onChooseDifferentPurpose={() => {
            setErrorMessage('');
            setWalkinData((prev) => ({
              ...prev,
              purpose: '',
              selectedCarId: '',
              selectedCarName: '',
              fuelTypes: [],
              selectedLocationId: '',
              selectedLocationName: '',
              salespersonId: '',
              salespersonName: '',
              walkinId: null,
              tokenNumber: '',
              returningCustomer: null
            }));
            setRepeatFlowAction(null);

            logKioskTest('REPEAT', 'Customer chose different purpose. Restarted normal flow.', {
              mobile: walkinData.mobileNumber
            });
            setStep(KIOSK_STEPS.WELCOME);
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
          selectedLocationId={walkinData.selectedLocationId}
          selectedSalespersonId={walkinData.salespersonId}
          submitting={saving}
          onBack={() =>
            setStep(
              repeatFlowAction === 'change_salesperson'
                ? KIOSK_STEPS.REPEAT_CUSTOMER
                : KIOSK_STEPS.FUEL_SELECTION
            )
          }
          onNext={async ({ salespersonId, salespersonName, locationId, locationName }) => {
            setErrorMessage('');
            setSaving(true);
            try {
              const repeatData = walkinData.returningCustomer;
              const isRepeatReassignment = repeatFlowAction === 'change_salesperson' && Boolean(repeatData);
              const selectedPurpose = isRepeatReassignment
                ? repeatData.purpose || repeatData.last_purpose || walkinData.purpose
                : walkinData.purpose;
              const selectedCarId = isRepeatReassignment ? repeatData.car_id : walkinData.selectedCarId;
              const selectedFuelTypes = isRepeatReassignment
                ? normalizeFuelSelection(repeatData.fuel_type)
                : walkinData.fuelTypes;

              const created = await createWalkIn({
                customer_name: walkinData.customerName,
                mobile_number: walkinData.mobileNumber,
                purpose: selectedPurpose,
                car_id: selectedCarId,
                fuel_type: selectedFuelTypes,
                fuel_types: selectedFuelTypes,
                salesperson_id: salespersonId,
                location_id: locationId
              });

              console.assert(Boolean(created?.token_number), '[KIOSK TEST][NEW] Token should be generated for new customer.');
              console.assert(Boolean(created?.id), '[KIOSK TEST][NEW] Walk-in record should be saved.');

              setWalkinData((prev) => ({
                ...prev,
                purpose: selectedPurpose,
                selectedCarId: selectedCarId || '',
                fuelTypes: selectedFuelTypes,
                selectedLocationId: locationId,
                selectedLocationName: locationName,
                salespersonId,
                salespersonName,
                walkinId: created.id,
                tokenNumber: created.token_number || ''
              }));

              logKioskTest('NEW', 'Token generated and walk-in saved.', {
                mobile: walkinData.mobileNumber,
                token: created.token_number,
                walkinId: created.id
              });
              setRepeatFlowAction(null);
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
  }, [repeatFlowAction, saving, step, walkinData]);

  return (
    <div className="kiosk-grid mx-auto w-full max-w-[600px]">
      {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
      <div key={step} className="step-transition">
        {stepView}
      </div>
    </div>
  );
}