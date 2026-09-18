/**
 * PHASE 4: File Attachments UI
 * Drag-and-drop file upload with preview for images, PDFs, and documents
 */

"use client";

import { useState, useRef } from "react";
import { Upload, FileIcon, X, AlertCircle } from "lucide-react";

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
  const [isDragging, setIsDragging] = useState(false);
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
      setError(`Maximum ${maxFiles} files allowed`);
      return;
    }

    Array.from(fileList).forEach((file) => {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError(`File type not supported: ${file.type}`);
        return;
      }

      if (file.size > maxSize) {
        setError(`File too large: ${file.name} (max ${formatFileSize(maxSize)})`);
        return;
      }

      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const upload: UploadedFile = {
        id,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
      };

      // Generate preview for images
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

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          processFiles(e.dataTransfer.files);
        }}
        className={`rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
          isDragging
            ? "border-blue-400 bg-blue-50"
            : "border-stone-300 bg-stone-50 hover:border-stone-400"
        }`}
      >
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
          className="mx-auto flex flex-col items-center gap-2"
          type="button"
        >
          <Upload className="w-6 h-6 text-stone-400" />
          <span className="text-sm font-medium text-stone-600">
            Drag files here or click to browse
          </span>
          <span className="text-xs text-stone-500">
            Images, PDFs, Word, Excel (max {formatFileSize(maxSize)})
          </span>
        </button>
      </div>

      {error && (
        <div className="flex gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {files.length > 0 && (
        <div className="grid gap-2">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 rounded-lg bg-stone-50 p-3 border border-stone-200"
            >
              {file.preview ? (
                <img
                  src={file.preview}
                  alt={file.fileName}
                  className="w-10 h-10 rounded object-cover flex-shrink-0"
                />
              ) : (
                <FileIcon className="w-10 h-10 text-stone-400 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-900 truncate">
                  {file.fileName}
                </p>
                <p className="text-xs text-stone-500">
                  {formatFileSize(file.fileSize)}
                </p>
              </div>
              <button
                onClick={() => {
                  const updated = files.filter((f) => f.id !== file.id);
                  setFiles(updated);
                  onFilesSelected(updated);
                }}
                className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-200 rounded transition-colors"
                type="button"
                title="Remove file"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
