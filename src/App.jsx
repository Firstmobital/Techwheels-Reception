import { useState } from 'react';
import KioskContainer from './pages/Kiosk/KioskContainer';
import ReceptionDashboard from './pages/Reception/ReceptionDashboard';
import IVREntryScreen from './pages/Reception/IVREntryScreen';
import GreenFormQueue from './pages/Reception/GreenFormQueue';

export default function App() {
  const [activeInterface, setActiveInterface] = useState('kiosk');

  return (
    <div className="app-shell">
      <header className="interface-switch">
        <button
          type="button"
          className={activeInterface === 'kiosk' ? 'active' : ''}
          onClick={() => setActiveInterface('kiosk')}
        >
          Kiosk
        </button>
        <button
          type="button"
          className={activeInterface === 'dashboard' ? 'active' : ''}
          onClick={() => setActiveInterface('dashboard')}
        >
          Dashboard
        </button>
        <button
          type="button"
          className={activeInterface === 'ivr-entry' ? 'active' : ''}
          onClick={() => setActiveInterface('ivr-entry')}
        >
          IVR Entry
        </button>
        <button
          type="button"
          className={activeInterface === 'green-form' ? 'active' : ''}
          onClick={() => setActiveInterface('green-form')}
        >
          Green Form
        </button>
      </header>

      <main className={activeInterface === 'kiosk' ? 'kiosk-fullscreen' : 'reception-shell'}>
        {activeInterface === 'kiosk' ? <KioskContainer /> : null}
        {activeInterface === 'dashboard' ? <ReceptionDashboard /> : null}
        {activeInterface === 'ivr-entry' ? <IVREntryScreen /> : null}
        {activeInterface === 'green-form' ? <GreenFormQueue /> : null}
      </main>
    </div>
  );
}
