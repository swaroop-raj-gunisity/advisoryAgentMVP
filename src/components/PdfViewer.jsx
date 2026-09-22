import React from 'react';
import { X, MessageSquare, ExternalLink } from 'lucide-react';

export default function PdfViewer({ file, onClose, onSendToChat }) {
  if (!file) return null;

  const viewUrl = `/api/vault/files/${file.id}/view`;

  return (
    <div className="content-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface-alt)'
      }}>
        <span style={{ fontSize: '12px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {file.name}
        </span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
          <button
            onClick={() => onSendToChat(file)}
            className="btn-chat-action"
            style={{ fontSize: '10px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <MessageSquare style={{ width: '12px', height: '12px' }} />
            Send to Chat
          </button>
          {file.webViewLink && (
            <a
              href={file.webViewLink}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in Google Drive"
              style={{ color: 'var(--ink-muted)', display: 'flex' }}
            >
              <ExternalLink style={{ width: '14px', height: '14px' }} />
            </a>
          )}
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-muted)', display: 'flex', padding: '2px' }}
          >
            <X style={{ width: '16px', height: '16px' }} />
          </button>
        </div>
      </div>

      <div style={{ width: '100%', height: '500px', background: 'var(--surface)' }}>
        <iframe
          src={viewUrl}
          title={`PDF Viewer: ${file.name}`}
          style={{ width: '100%', height: '100%', border: 'none' }}
        />
      </div>
    </div>
  );
}
