import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getExistingIVRMobileNumbers,
  getMissedUploadLastByLocation,
  importMissedIVRLeads,
} from '../../services/ivrService';
import { getLocations } from '../../services/walkinService';

const REQUIRED_COLUMNS = ['CallDate', 'CustomerNumber'];
const BRANCH_REQUIRED_ERROR = 'Please select a branch before uploading.';

function normalizePhone(raw) {
  if (!raw) return null;
  const str = String(raw).trim();
  let digits;

  if (/e\+/i.test(str)) {
    const n = Math.round(parseFloat(str));
    if (Number.isNaN(n)) return null;
    digits = String(n);
  } else {
    digits = str.replace(/\D/g, '');
  }

  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^\d{10}$/.test(digits) ? digits : null;
}

function parseCallDate(rawDate) {
  if (!rawDate) return null;
  const value = String(rawDate).trim();
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T00:00:00`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }

    values.push(current.trim());
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
  });
}

function getColumnValue(row, aliases) {
  const keys = Object.keys(row || {});
  const normalizedAliases = aliases.map((alias) => alias.toLowerCase().replace(/\s+/g, ''));
  const key = keys.find((k) => normalizedAliases.includes(k.toLowerCase().replace(/\s+/g, '')));
  return key ? row[key] : '';
}

function hasColumn(row, aliases) {
  const keys = Object.keys(row || {});
  const normalizedKeys = keys.map((k) => k.toLowerCase().replace(/\s+/g, ''));
  const normalizedAliases = aliases.map((alias) => alias.toLowerCase().replace(/\s+/g, ''));
  return normalizedAliases.some((alias) => normalizedKeys.includes(alias));
}

function formatDateTime(value) {
  if (!value) return 'Never uploaded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never uploaded';
  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function IVRMissedScreen() {
  const fileInputRef = useRef(null);
  const [locations, setLocations] = useState([]);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [result, setResult] = useState(null);
  const [lastUploadByLocation, setLastUploadByLocation] = useState(new Map());

  useEffect(() => {
    let active = true;

    async function loadInitialData() {
      try {
        const [locs, lastUploaded] = await Promise.all([
          getLocations(),
          getMissedUploadLastByLocation(),
        ]);
        if (!active) return;
        setLocations(locs || []);
        setLastUploadByLocation(lastUploaded || new Map());
      } catch (error) {
        if (!active) return;
        setErrorMessage(error?.message || 'Failed to load branches.');
      } finally {
        if (active) setLoadingLocations(false);
      }
    }

    loadInitialData();
    return () => {
      active = false;
    };
  }, []);

  const selectedLocationName = useMemo(() => {
    const match = locations.find((loc) => String(loc.id) === String(selectedLocationId));
    return match?.name || '';
  }, [locations, selectedLocationId]);

  async function handleUpload(file) {
    if (!file) return;
    if (!selectedLocationId) {
      setErrorMessage(BRANCH_REQUIRED_ERROR);
      return;
    }

    const isZip = file.name.toLowerCase().endsWith('.zip');
    const isCsv = file.name.toLowerCase().endsWith('.csv');
    if (!isZip && !isCsv) {
      setErrorMessage('Please upload a ZIP or CSV file.');
      return;
    }

    setUploading(true);
    setErrorMessage('');
    setResult(null);

    try {
      let csvText = '';

      if (isZip) {
        if (!window.JSZip) {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load ZIP library.'));
            document.head.appendChild(script);
          });
        }

        const arrayBuffer = await file.arrayBuffer();
        const zip = await window.JSZip.loadAsync(arrayBuffer);
        const csvFile = Object.values(zip.files).find((f) => !f.dir && f.name.toLowerCase().endsWith('.csv'));
        if (!csvFile) throw new Error('No CSV file found inside ZIP.');
        csvText = await csvFile.async('text');
      } else {
        csvText = await file.text();
      }

      const rows = parseCSV(csvText);
      if (rows.length === 0) throw new Error('No rows found in uploaded file.');

      const missingColumns = REQUIRED_COLUMNS.filter((col) => !hasColumn(rows[0], [col]));
      if (missingColumns.length > 0) {
        throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
      }

      let invalidCount = 0;
      let inFileDuplicateCount = 0;
      const seen = new Set();
      const parsedLeads = [];

      rows.forEach((row) => {
        const mobile = normalizePhone(getColumnValue(row, ['CustomerNumber', 'CustomerNu']));
        if (!mobile) {
          invalidCount += 1;
          return;
        }

        if (seen.has(mobile)) {
          inFileDuplicateCount += 1;
          return;
        }

        seen.add(mobile);
        parsedLeads.push({
          mobile,
          callDate: parseCallDate(getColumnValue(row, ['CallDate'])),
        });
      });

      if (parsedLeads.length === 0) {
        throw new Error('No valid mobile numbers found after parsing.');
      }

      const existingMobiles = await getExistingIVRMobileNumbers(parsedLeads.map((lead) => lead.mobile));
      const leadsToInsert = parsedLeads.filter((lead) => !existingMobiles.has(lead.mobile));
      const existingDuplicateCount = parsedLeads.length - leadsToInsert.length;

      const { insertedCount } = await importMissedIVRLeads({
        locationId: selectedLocationId,
        leads: leadsToInsert,
      });

      const lastUploadedMap = await getMissedUploadLastByLocation();
      setLastUploadByLocation(lastUploadedMap || new Map());

      setResult({
        branchName: selectedLocationName || `Branch #${selectedLocationId}`,
        totalRows: rows.length,
        validUniqueRows: parsedLeads.length,
        invalidCount,
        inFileDuplicateCount,
        existingDuplicateCount,
        insertedCount,
      });
    } catch (error) {
      setErrorMessage(error?.message || 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <section className="kiosk-card mx-auto w-full rounded-2xl p-6 shadow-lg" style={{ maxWidth: '1100px' }}>
      <h1 className="kiosk-title !mb-1 text-4xl">IVR Missed</h1>
      <p className="mb-5 text-base text-slate-600">
        Import missed IVR calls by branch. Only CallDate and CustomerNumber are used.
      </p>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-semibold text-slate-700" htmlFor="ivr-missed-branch">
            Branch
          </label>
          <select
            id="ivr-missed-branch"
            className="kiosk-select !min-h-[38px] !py-1.5 !text-sm w-72"
            value={selectedLocationId}
            onChange={(event) => {
              setSelectedLocationId(event.target.value);
              setErrorMessage('');
            }}
            disabled={loadingLocations}
          >
            <option value="">{loadingLocations ? 'Loading branches...' : 'Select branch before upload'}</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>{loc.name || `Branch #${loc.id}`}</option>
            ))}
          </select>
          {selectedLocationName ? <span className="text-xs text-slate-500">Selected: {selectedLocationName}</span> : null}
        </div>
      </div>

      <div
        className="mt-4 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-8 py-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files?.[0];
          handleUpload(file);
        }}
      >
        <div className="text-4xl mb-3">Upload</div>
        <p className="text-lg font-semibold text-slate-700 mb-1">
          {uploading ? 'Processing upload...' : 'Upload missed call ZIP or CSV'}
        </p>
        <p className="text-sm text-slate-500 mb-3">Click to browse or drag and drop</p>
        <div className="inline-flex items-center gap-2 text-xs text-slate-400 bg-white rounded-xl border border-slate-200 px-4 py-2">
          <span>Required columns:</span>
          <code className="bg-slate-100 rounded px-1">CallDate</code>
          <code className="bg-slate-100 rounded px-1">CustomerNumber</code>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip,.csv"
          className="hidden"
          onChange={(event) => handleUpload(event.target.files?.[0])}
        />
      </div>

      {errorMessage ? (
        <div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {result ? (
        <div className="mt-4 rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          <p className="font-semibold">Import completed for {result.branchName}</p>
          <p>Total rows: {result.totalRows}</p>
          <p>Valid unique mobiles: {result.validUniqueRows}</p>
          <p>Invalid rows skipped: {result.invalidCount}</p>
          <p>In-file duplicates skipped: {result.inFileDuplicateCount}</p>
          <p>Existing duplicates skipped: {result.existingDuplicateCount}</p>
          <p>Inserted missed calls: {result.insertedCount}</p>
        </div>
      ) : null}

      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Branch upload status</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {locations.map((loc) => {
            const lastUploaded = lastUploadByLocation.get(String(loc.id));
            return (
              <div key={loc.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-sm font-semibold text-slate-800">Branch - {loc.name || `#${loc.id}`}</p>
                <p className="text-xs text-slate-500">Last uploaded at: {formatDateTime(lastUploaded)}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
