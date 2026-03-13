import { useCallback, useEffect, useMemo, useState } from 'react';
import { getWalkinReports } from '../../services/walkinService';

export default function ReceptionDashboard() {
  const defaultCustomDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [filterType, setFilterType] = useState('today');
  const [customDate, setCustomDate] = useState(defaultCustomDate);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const loadReports = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const reports = await getWalkinReports({
        filterType,
        customDate
      });
      setReportData(reports);
    } catch (error) {
      setErrorMessage(error?.message || 'Unable to load reports.');
    } finally {
      setLoading(false);
    }
  }, [customDate, filterType]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const filterLabel = useMemo(() => {
    if (filterType === 'thisMonth') return 'This Month';
    if (filterType === 'custom') return 'Custom Date';
    return 'Today';
  }, [filterType]);

  const getMetricLabel = (label, fallback = 'Unknown') => {
    const value = String(label || '').trim();
    return value || fallback;
  };

  if (loading) {
    return (
      <section className="panel report-panel">
        <h1>Reports</h1>
        <p>Loading walk-in reports...</p>
      </section>
    );
  }

  return (
    <section className="panel report-panel">
      <header className="report-header">
        <h1>Reports</h1>
        <p>Showroom walk-in analytics for reception.</p>
      </header>

      <div className="report-filter-row">
        <button
          type="button"
          className={`report-filter-btn ${filterType === 'today' ? 'active' : ''}`}
          onClick={() => setFilterType('today')}
        >
          Today
        </button>
        <button
          type="button"
          className={`report-filter-btn ${filterType === 'thisMonth' ? 'active' : ''}`}
          onClick={() => setFilterType('thisMonth')}
        >
          This Month
        </button>
        <button
          type="button"
          className={`report-filter-btn ${filterType === 'custom' ? 'active' : ''}`}
          onClick={() => setFilterType('custom')}
        >
          Custom Date
        </button>
      </div>

      {filterType === 'custom' ? (
        <div className="report-custom-date-wrap">
          <input
            type="date"
            className="report-date-input"
            value={customDate}
            onChange={(event) => setCustomDate(event.target.value)}
            max={defaultCustomDate}
          />
        </div>
      ) : null}

      {errorMessage ? <p className="error-text">{errorMessage}</p> : null}

      {reportData ? (
        <>
          <div className="report-summary-grid">
            <article className="report-card report-total-card">
              <h2>Total Walk-ins</h2>
              <p className="report-total-value">{reportData.totalWalkins}</p>
              <p className="report-meta">Range: {reportData.dateRange.label}</p>
            </article>
            <article className="report-card">
              <h2>Filter</h2>
              <p className="report-meta">{filterLabel}</p>
            </article>
          </div>

          <div className="report-grid">
            <article className="report-card">
              <h2>Purpose Breakdown</h2>
              <ul className="report-list">
                {reportData.purposeBreakdown.length ? (
                  reportData.purposeBreakdown.map((item) => (
                    <li key={`purpose-${item.label}`} className="report-list-item">
                      <span>{getMetricLabel(item.label)}</span>
                      <strong>{item.count}</strong>
                    </li>
                  ))
                ) : (
                  <li className="report-list-empty">No purpose data available.</li>
                )}
              </ul>
            </article>

            <article className="report-card">
              <h2>Model Interest</h2>
              <ul className="report-list">
                {reportData.modelInterest.length ? (
                  reportData.modelInterest.map((item) => (
                    <li key={`model-${item.label}`} className="report-list-item">
                      <span>{getMetricLabel(item.label)}</span>
                      <strong>{item.count}</strong>
                    </li>
                  ))
                ) : (
                  <li className="report-list-empty">No model interest data available.</li>
                )}
              </ul>
            </article>

            <article className="report-card">
              <h2>Fuel Preference</h2>
              <ul className="report-list">
                {reportData.fuelPreference.length ? (
                  reportData.fuelPreference.map((item) => (
                    <li key={`fuel-${item.label}`} className="report-list-item">
                      <span>{getMetricLabel(item.label)}</span>
                      <strong>{item.count}</strong>
                    </li>
                  ))
                ) : (
                  <li className="report-list-empty">No fuel preference data available.</li>
                )}
              </ul>
            </article>

            <article className="report-card">
              <h2>Salesperson Performance</h2>
              <ul className="report-list">
                {reportData.salespersonPerformance.length ? (
                  reportData.salespersonPerformance.map((item) => (
                    <li key={`sp-${item.label}`} className="report-list-item">
                      <span>{getMetricLabel(item.label, 'Unassigned')}</span>
                      <strong>{item.count}</strong>
                    </li>
                  ))
                ) : (
                  <li className="report-list-empty">No salesperson performance data available.</li>
                )}
              </ul>
            </article>
          </div>
        </>
      ) : null}
    </section>
  );
}
