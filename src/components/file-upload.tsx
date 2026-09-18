/**
 * File Attachments UI
 * Compact '+' icon upload button with preview chips for images, PDFs, and documents
 */

"use client";

import { useState, useRef } from "react";
import { Plus, FileIcon, X, AlertCircle } from "lucide-react";

export interface UploadedFile {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  preview?: string; // data URL for images
}

interface FileUploadProps {
  onFilesSelected: (files: UploadedFile[]) => void;
  maxSize?: number; // bytes, default 10MB
  maxFiles?: number; // default 5
}

const MAX_SIZE_DEFAULT = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
];

export function FileUpload({
  onFilesSelected,
  maxSize = MAX_SIZE_DEFAULT,
  maxFiles = 5,
}: FileUploadProps) {
  const [error, setError] = useState<string>();
  const [files, setFiles] = useState<UploadedFile[]>([]);
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

    Array.from(fileList).forEach((file) => {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(`Type not supported: ${file.name}`);
        return;
      }

      if (file.size > maxSize) {
        setError(`Too large: ${file.name} (max ${formatFileSize(maxSize)})`);
        return;
      }

      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const upload: UploadedFile = {
        id,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      };

      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (e) => {
          upload.preview = e.target?.result as string;
          newFiles.push(upload);
          if (newFiles.length === Array.from(fileList).filter(f => ALLOWED_TYPES.includes(f.type) && f.size <= maxSize).length) {
            const updated = [...files, ...newFiles];
            setFiles(updated);
            onFilesSelected(updated);
          }
        };
        reader.readAsDataURL(file);
      } else {
        newFiles.push(upload);
        const updated = [...files, ...newFiles];
        setFiles(updated);
        onFilesSelected(updated);
      }
    });
  }

  function removeFile(fileId: string) {
    const updated = files.filter((f) => f.id !== fileId);
    setFiles(updated);
    onFilesSelected(updated);
  }

  return (
    <div className="flex flex-col gap-1 inline-flex align-middle">
      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={(e) => {
          if (e.target.files) processFiles(e.target.files);
        }}
        className="hidden"
        accept={ALLOWED_TYPES.join(",")}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="icon-btn attach-btn"
        type="button"
        title="Attach photo or document (+)"
        aria-label="Attach file"
      >
        <Plus size={18} />
      </button>

      {error && (
        <div className="text-xs text-red-500 flex items-center gap-1 mt-1">
          <AlertCircle size={12} />
          <span>{error}</span>
        </div>
      )}

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 my-1">
          {files.map((file) => (
            <div
              key={file.id}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-stone-100 text-stone-700 text-xs border border-stone-200"
            >
              {file.preview ? (
                <img
                  src={file.preview}
                  alt={file.fileName}
                  className="w-4 h-4 rounded object-cover flex-shrink-0"
                />
              ) : (
                <FileIcon size={12} className="text-stone-500 flex-shrink-0" />
              )}
              <span className="truncate max-w-[120px] font-medium">{file.fileName}</span>
              <button
                onClick={() => removeFile(file.id)}
                className="hover:text-stone-900 p-0.5 rounded-full"
                type="button"
                title="Remove attachment"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
