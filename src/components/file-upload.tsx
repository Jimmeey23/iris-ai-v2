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
    <div className="flex items-center gap-1">
      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            processFiles(e.target.files);
            e.target.value = ""; // Reset input so same file can be re-selected
          }
        }}
        className="hidden"
        accept={ALLOWED_TYPES.join(",")}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="icon-btn attach-btn text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 transition-colors"
        type="button"
        title="Attach photo, document, or PDF (+)"
        aria-label="Attach file"
      >
        <Plus size={17} />
      </button>

      {error && (
        <div className="text-[11px] text-red-500 flex items-center gap-1 ml-1 animate-fadeIn">
          <AlertCircle size={11} />
          <span>{error}</span>
        </div>
      )}
    </div>
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
    <div className="flex flex-wrap gap-2 px-3 py-1.5 bg-stone-100/70 dark:bg-stone-900/70 border-t border-stone-200 dark:border-stone-800">
      {files.map((file) => (
        <div
          key={file.id}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200 text-xs border border-stone-200 dark:border-stone-700 shadow-sm"
        >
          {file.preview ? (
            <img
              src={file.preview}
              alt={file.fileName}
              className="w-4 h-4 rounded object-cover flex-shrink-0"
            />
          ) : file.fileType?.includes("pdf") ? (
            <FileText size={13} className="text-red-500 flex-shrink-0" />
          ) : (
            <ImageIcon size={13} className="text-blue-500 flex-shrink-0" />
          )}
          <span className="truncate max-w-[130px] font-medium text-[11px]">
            {file.fileName}
          </span>
          {onRemove && (
            <button
              onClick={() => onRemove(file.id)}
              className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-100 p-0.5 rounded transition-colors"
              type="button"
              title="Remove attachment"
            >
              <X size={11} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
