import { useState } from 'react';
import KioskContainer from './pages/Kiosk/KioskContainer';
import ReceptionDashboard from './pages/Reception/ReceptionDashboard';

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
          Customer Kiosk
        </button>
        <button
          type="button"
          className={activeInterface === 'reception' ? 'active' : ''}
          onClick={() => setActiveInterface('reception')}
        >
          Reception Dashboard
        </button>
      </header>

      <main className={activeInterface === 'kiosk' ? 'kiosk-fullscreen' : 'reception-shell'}>
        {activeInterface === 'kiosk' ? <KioskContainer /> : <ReceptionDashboard />}
      </main>
    </div>
  );
}
