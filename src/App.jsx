import { useEffect, useState } from 'react';
import KioskContainer from './pages/Kiosk/KioskContainer';
import ReceptionDashboard from './pages/Reception/ReceptionDashboard';
import IVREntryScreen from './pages/Reception/IVREntryScreen';
import GreenFormQueue from './pages/Reception/GreenFormQueue';
import LoginPage from './pages/LoginPage';
import { clearAuthSession, restoreAuthSession } from './services/authService';

export default function App() {
  const [activeInterface, setActiveInterface] = useState('kiosk');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    async function restoreSession() {
      const session = await restoreAuthSession();
      if (session?.isAuthenticated) {
        setIsAuthenticated(true);
      }
    }

    restoreSession();
  }, []);

  function handleLoginSuccess() {
    setIsAuthenticated(true);
  }

  async function handleLogout() {
    await clearAuthSession();
    setIsAuthenticated(false);
    setActiveInterface('kiosk');
  }

  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

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
        <button type="button" className="logout-btn" onClick={handleLogout}>
          Logout
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
