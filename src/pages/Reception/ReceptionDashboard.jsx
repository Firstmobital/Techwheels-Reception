import { useCallback, useEffect, useMemo, useState } from 'react';
import AssignSalespersonModal from './AssignSalespersonModal';
import {
  assignSalesPerson,
  getAvailableCars,
  getWaitingWalkins
} from '../../services/walkinService';
import { supabase } from '../../services/supabaseClient';

export default function ReceptionDashboard() {
  const [walkins, setWalkins] = useState([]);
  const [carMap, setCarMap] = useState({});
  const [selectedWalkinId, setSelectedWalkinId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  const selectedWalkin = useMemo(
    () => walkins.find((item) => item.id === selectedWalkinId) || null,
    [walkins, selectedWalkinId]
  );

  const loadDashboardData = useCallback(async (isInitialLoad = false) => {
    if (isInitialLoad) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    setErrorMessage('');
    try {
      const [waitingWalkins, cars] = await Promise.all([
        getWaitingWalkins(),
        getAvailableCars()
      ]);
      setWalkins(waitingWalkins);
      setCarMap(
        cars.reduce((acc, car) => {
          acc[car.id] = car.name || car.model_name || `Model #${car.id}`;
          return acc;
        }, {})
      );
    } catch (error) {
      setErrorMessage(error?.message || 'Unable to load waiting customers.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData(true);
  }, [loadDashboardData]);

  useEffect(() => {
    const channel = supabase
      .channel('reception-showroom-walkins')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'showroom_walkins'
        },
        (payload) => {
          if (payload.new?.status === 'waiting') {
            loadDashboardData();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadDashboardData]);

  const handleAssignSalesperson = async (salespersonId) => {
    if (!selectedWalkinId) return;

    setStatusMessage('');
    setErrorMessage('');
    try {
      const updated = await assignSalesPerson(selectedWalkinId, salespersonId);
      setStatusMessage(`Assigned successfully. Token generated: ${updated.token_number}`);
      setSelectedWalkinId(null);
      await loadDashboardData();
    } catch (error) {
      setErrorMessage(error?.message || 'Unable to assign salesperson.');
    }
  };

  const getModelName = (walkin) => {
    return (
      walkin.car_name ||
      walkin.model_name ||
      walkin.cars?.name ||
      walkin.cars?.model_name ||
      carMap[walkin.car_id] ||
      'N/A'
    );
  };

  const getFuelTypesLabel = (walkin) => {
    if (Array.isArray(walkin.fuel_types)) {
      return walkin.fuel_types.join(', ');
    }
    if (walkin.fuel_types) return walkin.fuel_types;
    if (Array.isArray(walkin.fuel_type)) return walkin.fuel_type.join(', ');
    return walkin.fuel_type || 'N/A';
  };

  const getCustomerName = (walkin) => walkin.customer_name || walkin.name || 'N/A';
  const getMobile = (walkin) => walkin.mobile_number || walkin.mobile || 'N/A';

  if (loading) {
    return (
      <section className="panel">
        <h1>Reception Dashboard</h1>
        <p>Loading waiting customers...</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <h1>Reception Dashboard</h1>
      <p>Waiting walk-ins ready for advisor assignment.</p>

      {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
      {statusMessage ? <p>{statusMessage}</p> : null}
      {refreshing ? <p>Refreshing dashboard...</p> : null}

      <table className="walkin-table">
        <thead>
          <tr>
            <th>Customer Name</th>
            <th>Mobile</th>
            <th>Model</th>
            <th>Fuel Types</th>
            <th>Purpose</th>
            <th>Assign Button</th>
          </tr>
        </thead>
        <tbody>
          {walkins.length === 0 ? (
            <tr>
              <td colSpan={6}>No waiting customers.</td>
            </tr>
          ) : (
            walkins.map((walkin) => (
              <tr key={walkin.id}>
                <td>{getCustomerName(walkin)}</td>
                <td>{getMobile(walkin)}</td>
                <td>{getModelName(walkin)}</td>
                <td>{getFuelTypesLabel(walkin)}</td>
                <td>{walkin.purpose || 'N/A'}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setSelectedWalkinId(walkin.id)}
                  >
                    Assign
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {selectedWalkin && (
        <AssignSalespersonModal
          walkin={selectedWalkin}
          onAssign={handleAssignSalesperson}
          onClose={() => setSelectedWalkinId(null)}
        />
      )}
    </section>
  );
}
