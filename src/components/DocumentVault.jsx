import React, { useState, useEffect, useCallback } from 'react';
import PdfDropzone from './PdfDropzone.jsx';
import VaultFileList from './VaultFileList.jsx';
import PdfViewer from './PdfViewer.jsx';
import VaultToolbar from './VaultToolbar.jsx';

export default function DocumentVault({ advisorId, onSendToChat, sessionId }) {
  const [files, setFiles] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [viewingFile, setViewingFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchFiles = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/vault/files');
      const data = await res.json();
      if (data.success) {
        setFiles(data.files);
      } else {
        console.error('Vault list error:', data.error);
      }
    } catch (err) {
      console.error('Failed to fetch vault files:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleUpload = async (pdfFiles) => {
    setUploading(true);
    try {
      for (const file of pdfFiles) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('advisorId', advisorId || 'EMP_9021');

        const res = await fetch('/api/vault/upload', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (!data.success) {
          console.error('Upload failed:', data.error);
        }
      }
      await fetchFiles();
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleToggleSelect = (file) => {
    setSelectedFiles(prev => {
      const exists = prev.some(f => f.id === file.id);
      if (exists) {
        return prev.filter(f => f.id !== file.id);
      }
      return [...prev, file];
    });
  };

  const handleViewFile = (file) => {
    setViewingFile(file);
  };

  const handleCloseViewer = () => {
    setViewingFile(null);
  };

  const handleDeleteFile = async (file) => {
    if (!confirm(`Delete "${file.name}" from vault?`)) return;

    try {
      const res = await fetch(`/api/vault/files/${file.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setFiles(prev => prev.filter(f => f.id !== file.id));
        setSelectedFiles(prev => prev.filter(f => f.id !== file.id));
        if (viewingFile?.id === file.id) setViewingFile(null);
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  const handleDeleteSelected = async () => {
    if (!confirm(`Delete ${selectedFiles.length} selected file(s)?`)) return;

    for (const file of selectedFiles) {
      try {
        await fetch(`/api/vault/files/${file.id}`, { method: 'DELETE' });
      } catch (err) {
        console.error(`Failed to delete ${file.name}:`, err);
      }
    }
    setSelectedFiles([]);
    await fetchFiles();
  };

  const handleSendToChat = (file) => {
    if (onSendToChat) {
      onSendToChat([file]);
    }
  };

  const handleSummarize = async () => {
    if (selectedFiles.length === 0) return;

    if (onSendToChat) {
      onSendToChat(selectedFiles);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchFiles();
    setRefreshing(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <PdfDropzone onUpload={handleUpload} uploading={uploading} />

      <VaultToolbar
        selectedFiles={selectedFiles}
        onSummarize={handleSummarize}
        onDeleteSelected={handleDeleteSelected}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />

      {viewingFile ? (
        <PdfViewer
          file={viewingFile}
          onClose={handleCloseViewer}
          onSendToChat={handleSendToChat}
        />
      ) : (
        <VaultFileList
          files={files}
          selectedFiles={selectedFiles}
          onToggleSelect={handleToggleSelect}
          onViewFile={handleViewFile}
          onDeleteFile={handleDeleteFile}
          onSendToChat={handleSendToChat}
          loading={loading}
        />
      )}
    </div>
  );
}
