"use client";

import { Upload, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  FileUpload,
  FileUploadDropzone,
  FileUploadItem,
  FileUploadItemDelete,
  FileUploadItemMetadata,
  FileUploadItemPreview,
  FileUploadList,
  FileUploadTrigger,
} from "@/components/ui/file-upload";

export const title = "Basic Dropzone";

type FileUploadDropzone1Props = {
  value: File[];
  onValueChange: (files: File[]) => void;
  maxFiles?: number;
  maxSize?: number;
  multiple?: boolean;
  accept?: string;
};

const Example = ({
  value,
  onValueChange,
  maxFiles = 1,
  maxSize = 10 * 1024 * 1024,
  multiple = false,
  accept = ".pdf,application/pdf",
}: FileUploadDropzone1Props) => {
  const [files, setFiles] = React.useState<File[]>([]);

  React.useEffect(() => {
    setFiles(value);
  }, [value]);

  const onFileReject = React.useCallback((file: File, message: string) => {
    toast(message, {
      description: `"${file.name.length > 20 ? `${file.name.slice(0, 20)}...` : file.name}" has been rejected`,
    });
  }, []);

  const handleValueChange = React.useCallback(
    (nextFiles: File[]) => {
      setFiles(nextFiles);
      onValueChange(nextFiles);
    },
    [onValueChange],
  );

  return (
    <FileUpload
      maxFiles={maxFiles}
      maxSize={maxSize}
      className="w-full max-w-md"
      value={files}
      onValueChange={handleValueChange}
      onFileReject={onFileReject}
      multiple={multiple}
      accept={accept}
    >
      <FileUploadDropzone>
        <div className="flex flex-col items-center gap-1 text-center">
          <div className="flex items-center justify-center rounded-full border p-2.5">
            <Upload className="size-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">Drag & drop files here</p>
          <p className="text-xs text-muted-foreground">
            Or click to browse (PDF only)
          </p>
        </div>
        <FileUploadTrigger asChild>
          <Button variant="outline" size="sm" className="mt-2 w-fit">
            Browse files
          </Button>
        </FileUploadTrigger>
      </FileUploadDropzone>
      <FileUploadList>
        {files.map((file, index) => (
          <FileUploadItem key={index} value={file}>
            <FileUploadItemPreview />
            <FileUploadItemMetadata />
            <FileUploadItemDelete asChild>
              <Button variant="ghost" size="icon" className="size-7">
                <X className="size-4" />
              </Button>
            </FileUploadItemDelete>
          </FileUploadItem>
        ))}
      </FileUploadList>
    </FileUpload>
  );
};

export default Example;
