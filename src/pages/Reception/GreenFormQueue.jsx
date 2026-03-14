import { useEffect, useMemo, useState } from 'react';
import {
  getPendingLeads,
  getTodayGreenFormStats,
  submitOptyId
} from '../../services/greenFormService';

function getRowKey(row) {
  return `${row.source_type}-${row.id}`;
}

function formatSource(sourceType) {
  const normalizedSourceType = String(sourceType || '').toLowerCase();
  if (normalizedSourceType === 'ivr') return 'IVR';
  if (normalizedSourceType === 'ai') return 'AI Lead';
  return 'Walk-in';
}

function formatDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';

  return parsed.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function GreenFormQueue() {
  const [rows, setRows] = useState([]);
  const [optyValues, setOptyValues] = useState({});
  const [submittingRows, setSubmittingRows] = useState({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [stats, setStats] = useState({
    pending_today: 0,
    uploaded_today: 0
  });

  useEffect(() => {
    let mounted = true;

    const loadRows = async () => {
      setLoading(true);
      setErrorMessage('');
      try {
        const [leads, todayStats] = await Promise.all([
          getPendingLeads(),
          getTodayGreenFormStats()
        ]);
        if (mounted) {
          setRows(leads || []);
          setStats({
            pending_today: todayStats?.pending_today || 0,
            uploaded_today: todayStats?.uploaded_today || 0
          });
        }
      } catch (error) {
        if (mounted) {
          setErrorMessage(error?.message || 'Unable to load pending leads.');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadRows();

    return () => {
      mounted = false;
    };
  }, []);

  const hasRows = useMemo(() => rows.length > 0, [rows.length]);

  const handleSubmit = async (row) => {
    const rowKey = getRowKey(row);
    const optyId = String(optyValues[rowKey] || '').trim();
    if (!optyId) {
      setErrorMessage('Please enter Opty ID before submitting.');
      return;
    }

    setSubmittingRows((prev) => ({ ...prev, [rowKey]: true }));
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await submitOptyId(row.source_type, row.id, optyId);

      setRows((prev) => prev.filter((item) => getRowKey(item) !== rowKey));
      setOptyValues((prev) => {
        const next = { ...prev };
        delete next[rowKey];
        return next;
      });

      const todayStats = await getTodayGreenFormStats();
      setStats({
        pending_today: todayStats?.pending_today || 0,
        uploaded_today: todayStats?.uploaded_today || 0
      });

      setSuccessMessage(`Submitted Opty ID for ${row.customer_name || 'lead'}.`);
    } catch (error) {
      setErrorMessage(error?.message || 'Unable to submit Opty ID.');
    } finally {
      setSubmittingRows((prev) => {
        const next = { ...prev };
        delete next[rowKey];
        return next;
      });
    }
  };

  return (
    <section className="panel report-panel">
      <header className="report-header">
        <h1>Green Form Queue</h1>
        <p>Pending leads requiring Opty ID submission.</p>
      </header>

      {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
      {successMessage ? <p className="text-green-700">{successMessage}</p> : null}

      <div className="mb-3 flex justify-end">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 shadow-sm">
          <p className="m-0 font-semibold">Pending Today : {stats.pending_today}</p>
          <p className="m-0 mt-1 font-semibold">Uploaded Today : {stats.uploaded_today}</p>
        </div>
      </div>

      {loading ? <p>Loading pending leads...</p> : null}

      {!loading && !hasRows ? <p>No pending leads.</p> : null}

      {!loading && hasRows ? (
        <div className="overflow-x-auto">
          <table className="walkin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Customer Name</th>
                <th>Mobile Number</th>
                <th>Model</th>
                <th>Branch</th>
                <th>Sales Advisor</th>
                <th>Source</th>
                <th>Opty ID</th>
                <th>Submit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const rowKey = getRowKey(row);
                const submitting = Boolean(submittingRows[rowKey]);

                return (
                  <tr key={rowKey}>
                    <td>{formatDate(row.created_at)}</td>
                    <td>{row.customer_name || '-'}</td>
                    <td>{row.mobile_number || '-'}</td>
                    <td>{row.model_name || '-'}</td>
                    <td>{row.location_name || '-'}</td>
                    <td>{row.salesperson_name || '-'}</td>
                    <td>{formatSource(row.source_type)}</td>
                    <td>
                      <input
                        type="text"
                        className="kiosk-input"
                        value={optyValues[rowKey] || ''}
                        placeholder="Enter Opty ID"
                        onChange={(event) => {
                          const value = event.target.value;
                          setOptyValues((prev) => ({ ...prev, [rowKey]: value }));
                          setSuccessMessage('');
                        }}
                        disabled={submitting}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => handleSubmit(row)}
                        disabled={submitting}
                      >
                        {submitting ? 'Submitting...' : 'Submit'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}