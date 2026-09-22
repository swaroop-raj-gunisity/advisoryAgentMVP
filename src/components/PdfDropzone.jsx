import React, { useState, useRef } from 'react';
import { Upload } from 'lucide-react';

export default function PdfDropzone({ onUpload, uploading }) {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files).filter(
      f => f.type === 'application/pdf'
    );
    if (files.length > 0) {
      onUpload(files);
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      onUpload(files);
    }
    e.target.value = '';
  };

  return (
    <div
      className={`upload-zone ${dragActive ? 'drag-active' : ''}`}
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      style={{
        border: dragActive ? '2px solid var(--accent)' : undefined,
        background: dragActive ? 'var(--accent-light, rgba(59,130,246,0.05))' : undefined,
        transition: 'all 0.2s ease'
      }}
    >
      <Upload className="upload-icon w-10 h-10 mx-auto" />
      <h4 className="upload-title">
        {dragActive ? 'Drop PDF here' : 'Upload PDF to Document Vault'}
      </h4>
      <p className="upload-desc">
        Drag & drop or click to browse. PDF only, max 25MB.
      </p>

      <div style={{ marginTop: '16px' }}>
        <label className="btn-chat-action primary" style={{ cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.6 : 1 }}>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileSelect}
            disabled={uploading}
          />
          {uploading ? 'Uploading...' : 'Choose Files'}
        </label>
      </div>

      {uploading && (
        <p style={{ fontSize: '12px', color: 'var(--accent)', marginTop: '8px' }} className="animate-pulse">
          Uploading to Google Drive...
        </p>
      )}
    </div>
  );
}
