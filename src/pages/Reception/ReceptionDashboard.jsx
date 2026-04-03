import { useCallback, useEffect, useMemo, useState } from 'react';
import { getWalkinReports } from '../../services/walkinService';
import WalkinDetailView from './WalkinDetailView';

export default function ReceptionDashboard() {
  const defaultCustomDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [filterType, setFilterType] = useState('today');
  const [viewMode, setViewMode] = useState('summary');
  const [customDate, setCustomDate] = useState(defaultCustomDate);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [selectedSalesperson, setSelectedSalesperson] = useState('all');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [selectedWalkinId, setSelectedWalkinId] = useState(null);

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

  const getSalespersonName = (row) =>
    `${row?.salesperson?.first_name || ''} ${row?.salesperson?.last_name || ''}`.trim();

  const getTableValue = (value) => {
    const text = String(value || '').trim();
    return text || '-';
  };

  const formatDate = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString();
  };

  const formatTime = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const tableRows = reportData?.rows || [];

  const salespersonOptions = useMemo(() => {
    const names = new Set();
    tableRows.forEach((row) => {
      const name = getSalespersonName(row);
      if (name) names.add(name);
    });
    return ['all', ...Array.from(names).sort((a, b) => a.localeCompare(b))];
  }, [tableRows]);

  const branchOptions = useMemo(() => {
    const names = new Set();
    tableRows.forEach((row) => {
      const name = String(row?.location?.name || '').trim();
      if (name) names.add(name);
    });
    return ['all', ...Array.from(names).sort((a, b) => a.localeCompare(b))];
  }, [tableRows]);

  const filteredRows = useMemo(() => {
    return tableRows.filter((row) => {
      const salespersonName = getSalespersonName(row);
      const branchName = String(row?.location?.name || '').trim();

      const matchesSalesperson = selectedSalesperson === 'all' || salespersonName === selectedSalesperson;
      const matchesBranch = selectedBranch === 'all' || branchName === selectedBranch;

      return matchesSalesperson && matchesBranch;
    });
  }, [tableRows, selectedSalesperson, selectedBranch]);

  const selectedWalkin = useMemo(() => {
    if (!selectedWalkinId || !tableRows) return null;
    return tableRows.find((row) => row.id === selectedWalkinId) || null;
  }, [selectedWalkinId, tableRows]);

  useEffect(() => {
    if (selectedSalesperson !== 'all' && !salespersonOptions.includes(selectedSalesperson)) {
      setSelectedSalesperson('all');
    }
  }, [selectedSalesperson, salespersonOptions]);

  useEffect(() => {
    if (selectedBranch !== 'all' && !branchOptions.includes(selectedBranch)) {
      setSelectedBranch('all');
    }
  }, [selectedBranch, branchOptions]);

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

      <div className="report-filter-row">
        <button
          type="button"
          className={`report-filter-btn ${viewMode === 'summary' ? 'active' : ''}`}
          onClick={() => setViewMode('summary')}
        >
          Summary
        </button>
        <button
          type="button"
          className={`report-filter-btn ${viewMode === 'table' ? 'active' : ''}`}
          onClick={() => setViewMode('table')}
        >
          Table View
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
          {viewMode === 'summary' ? (
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

                <article className="report-card">
                  <h2>Branch Walk-ins</h2>
                  <ul className="report-list">
                    {reportData.branchWalkins?.length ? (
                      reportData.branchWalkins.map((item) => (
                        <li key={`branch-${item.label}`} className="report-list-item">
                          <span>{getMetricLabel(item.label)}</span>
                          <strong>{item.count}</strong>
                        </li>
                      ))
                    ) : (
                      <li className="report-list-empty">No branch data available.</li>
                    )}
                  </ul>
                </article>
              </div>
            </>
          ) : (
            <article className="report-card">
              <h2>Walk-in Rows</h2>
              <div className="report-filter-row">
                <select
                  className="report-date-input"
                  value={selectedSalesperson}
                  onChange={(event) => setSelectedSalesperson(event.target.value)}
                >
                  <option value="all">All Salespersons</option>
                  {salespersonOptions
                    .filter((name) => name !== 'all')
                    .map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                </select>

                <select
                  className="report-date-input"
                  value={selectedBranch}
                  onChange={(event) => setSelectedBranch(event.target.value)}
                >
                  <option value="all">All Branches</option>
                  {branchOptions
                    .filter((name) => name !== 'all')
                    .map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                </select>
              </div>
              <p className="report-meta">Rows: {filteredRows.length}</p>
              <div style={{ overflowX: 'auto' }}>
                <table className="walkin-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Customer Name</th>
                      <th>Mobile Number</th>
                      <th>Purpose</th>
                      <th>Interested Model</th>
                      <th>Fuel Types</th>
                      <th>Salesperson</th>
                      <th>Location</th>
                      <th>Token Number</th>
                      <th>Status</th>
                      <th>Opty Status</th>
                      <th>Opty ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.length ? (
                      filteredRows.map((row) => {
                        const salespersonName = getSalespersonName(row);
                        const fuelTypes = Array.isArray(row?.fuel_types) ? row.fuel_types.join(', ') : '-';
                        const optyStatus = String(row?.opty_status || '').trim();
                        const showOptyId = optyStatus.toLowerCase() === 'submitted';

                        return (
                          <tr key={row.id} onClick={() => setSelectedWalkinId(row.id)} style={{ cursor: 'pointer' }}>
                            <td>{formatDate(row.created_at)}</td>
                            <td>{formatTime(row.created_at)}</td>
                            <td>{getTableValue(row.customer_name)}</td>
                            <td>{getTableValue(row.mobile_number)}</td>
                            <td>{getTableValue(row.purpose)}</td>
                            <td>{getTableValue(row?.car?.name)}</td>
                            <td>{getTableValue(fuelTypes)}</td>
                            <td>{getTableValue(salespersonName)}</td>
                            <td>{getTableValue(row?.location?.name)}</td>
                            <td>{getTableValue(row.token_number)}</td>
                            <td>{getTableValue(row.status)}</td>
                            <td>{getTableValue(row.opty_status)}</td>
                            <td>{showOptyId ? getTableValue(row.opty_id) : '-'}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={13} className="report-list-empty">
                          No walk-in rows available for this range.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          )}
        </>
      ) : null}

      {selectedWalkin && (
        <WalkinDetailView
          walkin={selectedWalkin}
          onClose={() => setSelectedWalkinId(null)}
          onRefresh={loadReports}
        />
      )}
    </section>
  );
}
