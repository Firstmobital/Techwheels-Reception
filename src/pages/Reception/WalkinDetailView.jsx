import { useState } from 'react';
import EditWalkinModal from './EditWalkinModal';

function toStartOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isCreatedToday(createdAtIso) {
  if (!createdAtIso) return false;
  const walkinDate = toStartOfDay(new Date(createdAtIso));
  const today = toStartOfDay(new Date());
  return walkinDate.getTime() === today.getTime();
}

export default function WalkinDetailView({ walkin, onClose, onRefresh }) {
  const [showEditModal, setShowEditModal] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!walkin) return null;

  const canEdit = isCreatedToday(walkin.created_at);
  const fuelTypes = Array.isArray(walkin?.fuel_types) 
    ? walkin.fuel_types.join(', ') 
    : (walkin?.fuel_type ? String(walkin.fuel_type) : '-');

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

  const getDisplayValue = (value) => {
    const text = String(value || '').trim();
    return text || '-';
  };

  const getSalespersonName = (salesperson) => {
    if (!salesperson) return '-';
    const firstName = salesperson?.first_name || '';
    const lastName = salesperson?.last_name || '';
    return `${firstName} ${lastName}`.trim() || '-';
  };

  return (
    <>
      <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
          <div className="detail-header">
            <h2>Walk-in Details</h2>
            <button 
              type="button" 
              className="detail-close-btn" 
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {!canEdit && (
            <p className="info-text">
              ℹ️ This walk-in cannot be edited (not from today). Create a new entry if needed.
            </p>
          )}

          <div className="detail-content">
            <section className="detail-section">
              <h3>Customer Information</h3>
              <div className="detail-row">
                <span className="detail-label">Name:</span>
                <span className="detail-value">{getDisplayValue(walkin.customer_name)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Mobile:</span>
                <span className="detail-value">{getDisplayValue(walkin.mobile_number)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Purpose:</span>
                <span className="detail-value">{getDisplayValue(walkin.purpose)}</span>
              </div>
            </section>

            <section className="detail-section">
              <h3>Vehicle & Preferences</h3>
              <div className="detail-row">
                <span className="detail-label">Interested Model:</span>
                <span className="detail-value">{getDisplayValue(walkin?.car?.name)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Fuel Types:</span>
                <span className="detail-value">{fuelTypes}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Exchange Enquiry:</span>
                <span className="detail-value">{walkin.is_exchange_enquiry ? 'Yes' : 'No'}</span>
              </div>
            </section>

            <section className="detail-section">
              <h3>Assignment</h3>
              <div className="detail-row">
                <span className="detail-label">Salesperson:</span>
                <span className="detail-value">{getSalespersonName(walkin.salesperson)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Location:</span>
                <span className="detail-value">{getDisplayValue(walkin?.location?.name)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Status:</span>
                <span className="detail-value">{getDisplayValue(walkin.status)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Token:</span>
                <span className="detail-value">{getDisplayValue(walkin.token_number)}</span>
              </div>
            </section>

            <section className="detail-section">
              <h3>Metadata</h3>
              <div className="detail-row">
                <span className="detail-label">Created:</span>
                <span className="detail-value">
                  {formatDate(walkin.created_at)} at {formatTime(walkin.created_at)}
                </span>
              </div>
              {walkin.opty_id && (
                <div className="detail-row">
                  <span className="detail-label">Opportunity ID:</span>
                  <span className="detail-value">{getDisplayValue(walkin.opty_id)}</span>
                </div>
              )}
              {walkin.opty_status && (
                <div className="detail-row">
                  <span className="detail-label">Opportunity Status:</span>
                  <span className="detail-value">{getDisplayValue(walkin.opty_status)}</span>
                </div>
              )}
            </section>
          </div>

          <div className="kiosk-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
            {canEdit && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowEditModal(true)}
                disabled={saving}
              >
                Edit
              </button>
            )}
          </div>
        </div>
      </div>

      {showEditModal && (
        <EditWalkinModal
          walkin={walkin}
          onClose={() => setShowEditModal(false)}
          onSave={async () => {
            setSaving(true);
            try {
              await onRefresh();
              setShowEditModal(false);
            } finally {
              setSaving(false);
            }
          }}
        />
      )}
    </>
  );
}
