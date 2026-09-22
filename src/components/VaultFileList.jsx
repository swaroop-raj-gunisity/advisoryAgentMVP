import React from 'react';
import { FileText, Trash2, Eye, MessageSquare } from 'lucide-react';

export default function VaultFileList({
  files,
  selectedFiles,
  onToggleSelect,
  onViewFile,
  onDeleteFile,
  onSendToChat,
  loading
}) {
  if (loading) {
    return (
      <div className="content-card" style={{ textAlign: 'center', padding: '24px' }}>
        <p style={{ fontSize: '12px', color: 'var(--ink-muted)' }} className="animate-pulse">
          Loading vault files from Google Drive...
        </p>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="content-card" style={{ textAlign: 'center', padding: '24px' }}>
        <FileText style={{ width: '32px', height: '32px', color: 'var(--ink-muted)', margin: '0 auto 8px' }} />
        <p style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>
          No documents in vault. Upload a PDF to get started.
        </p>
      </div>
    );
  }

  const isSelected = (fileId) => selectedFiles.some(f => f.id === fileId);

  return (
    <div className="content-card">
      <h3
        className="card-title"
        style={{ fontSize: '11px', color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '12px' }}
      >
        Vault Documents ({files.length})
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {files.map((file) => (
          <div
            key={file.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 12px',
              border: isSelected(file.id) ? '1px solid var(--accent)' : '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: isSelected(file.id) ? 'var(--accent-light, rgba(59,130,246,0.04))' : 'var(--surface-alt)',
              fontSize: '12px',
              transition: 'all 0.15s ease'
            }}
          >
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1, minWidth: 0 }}>
              <input
                type="checkbox"
                checked={isSelected(file.id)}
                onChange={() => onToggleSelect(file)}
                style={{ cursor: 'pointer', flexShrink: 0 }}
              />
              <FileText style={{ width: '16px', height: '16px', color: 'var(--accent)', flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {file.name}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--ink-muted)' }}>
                  {file.size ? `${(parseInt(file.size) / 1024).toFixed(0)} KB` : ''}
                  {file.createdTime ? ` • ${new Date(file.createdTime).toLocaleDateString()}` : ''}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
              <button
                onClick={() => onViewFile(file)}
                title="View PDF"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                  borderRadius: '4px', color: 'var(--ink-muted)', display: 'flex'
                }}
              >
                <Eye style={{ width: '14px', height: '14px' }} />
              </button>
              <button
                onClick={() => onSendToChat(file)}
                title="Send to AI Chat"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                  borderRadius: '4px', color: 'var(--ink-muted)', display: 'flex'
                }}
              >
                <MessageSquare style={{ width: '14px', height: '14px' }} />
              </button>
              <button
                onClick={() => onDeleteFile(file)}
                title="Delete"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '4px',
                  borderRadius: '4px', color: 'var(--danger, #ef4444)', display: 'flex'
                }}
              >
                <Trash2 style={{ width: '14px', height: '14px' }} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
