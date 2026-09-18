/**
 * File Attachments Component
 * Allows attaching images, documents, and PDFs with preview thumbnails and file badges.
 */

"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, FileText, Image as ImageIcon, X, AlertCircle } from "lucide-react";

export interface UploadedFile {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  preview?: string; // data URL for images
  file?: File;
}

interface FileUploadProps {
  onFilesSelected: (files: UploadedFile[]) => void;
  files?: UploadedFile[];
  maxSize?: number; // bytes, default 10MB
  maxFiles?: number; // default 5
}

const MAX_SIZE_DEFAULT = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
];

export function FileUpload({
  onFilesSelected,
  files = [],
  maxSize = MAX_SIZE_DEFAULT,
  maxFiles = 5,
}: FileUploadProps) {
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  function processFiles(fileList: FileList) {
    setError(undefined);
    const newFiles: UploadedFile[] = [];

    if (fileList.length + files.length > maxFiles) {
      setError(`Max ${maxFiles} files allowed`);
      return;
    }

    const fileArr = Array.from(fileList);
    let pendingImages = 0;

    fileArr.forEach((file) => {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(`File type not supported: ${file.name}`);
        return;
      }

      if (file.size > maxSize) {
        setError(`File too large: ${file.name} (max ${formatFileSize(maxSize)})`);
        return;
      }

      const id = `att_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`;
      const upload: UploadedFile = {
        id,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        file,
      };

      if (file.type.startsWith("image/")) {
        pendingImages++;
        const reader = new FileReader();
        reader.onload = (e) => {
          upload.preview = e.target?.result as string;
          newFiles.push(upload);
          pendingImages--;
          if (pendingImages === 0) {
            onFilesSelected([...files, ...newFiles]);
          }
        };
        reader.readAsDataURL(file);
      } else {
        newFiles.push(upload);
      }
    });

    if (pendingImages === 0 && newFiles.length > 0) {
      onFilesSelected([...files, ...newFiles]);
    }
  }

  function removeFile(fileId: string) {
    const updated = files.filter((f) => f.id !== fileId);
    onFilesSelected(updated);
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            processFiles(e.target.files);
            e.target.value = "";
          }
        }}
        className="hidden"
        accept={ALLOWED_TYPES.join(",")}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="icon-btn compose-action-btn attach-btn"
        type="button"
        title="Attach photo, document, or PDF (+)"
        aria-label="Attach file"
      >
        <Plus size={15} />
      </button>

      {error && (
        <span className="upload-error-inline" title={error}>
          <AlertCircle size={10} />
          {error}
        </span>
      )}
    </>
  );
}

/** Previews for attached files in composer or chat message */
export function AttachmentPreviewList({
  files,
  onRemove,
}: {
  files: UploadedFile[];
  onRemove?: (id: string) => void;
}) {
  if (!files || files.length === 0) return null;

  return (
    <div className="compose-attachment-tray">
      {files.map((file) => (
        <div key={file.id} className="attachment-chip">
          {file.preview ? (
            <img src={file.preview} alt={file.fileName} className="attachment-thumb" />
          ) : file.fileType?.includes("pdf") ? (
            <FileText size={12} className="attachment-type-icon pdf" />
          ) : (
            <ImageIcon size={12} className="attachment-type-icon" />
          )}
          <span className="attachment-name">{file.fileName}</span>
          {onRemove && (
            <button
              onClick={() => onRemove(file.id)}
              className="attachment-remove"
              type="button"
              title="Remove attachment"
            >
              <X size={10} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
