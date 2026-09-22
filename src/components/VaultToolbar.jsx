import React from 'react';
import { RefreshCw, MessageSquare, Trash2 } from 'lucide-react';

export default function VaultToolbar({
  selectedFiles,
  onSummarize,
  onDeleteSelected,
  onRefresh,
  refreshing
}) {
  const hasSelection = selectedFiles.length > 0;

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '12px'
    }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        {hasSelection && (
          <>
            <span style={{ fontSize: '11px', color: 'var(--ink-muted)' }}>
              {selectedFiles.length} selected
            </span>
            <button
              onClick={onSummarize}
              className="btn-chat-action primary"
              style={{ fontSize: '10px', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <MessageSquare style={{ width: '12px', height: '12px' }} />
              Summarize Selected
            </button>
            <button
              onClick={onDeleteSelected}
              className="btn-chat-action"
              style={{ fontSize: '10px', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--danger, #ef4444)' }}
            >
              <Trash2 style={{ width: '12px', height: '12px' }} />
              Delete
            </button>
          </>
        )}
      </div>

      <button
        onClick={onRefresh}
        disabled={refreshing}
        style={{
          background: 'none',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          cursor: refreshing ? 'not-allowed' : 'pointer',
          padding: '5px 10px',
          fontSize: '10px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          color: 'var(--ink-muted)',
          opacity: refreshing ? 0.5 : 1
        }}
      >
        <RefreshCw style={{ width: '12px', height: '12px', animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
        Refresh
      </button>
    </div>
  );
}
