import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  IpaUploadError,
  pickAndUploadIpa,
  type IpaUploadResult,
} from '../services/ipa-upload';

export type IpaUploaderProps = {
  accentColor: string;
  disabled?: boolean;
  labelColor: string;
  secondaryLabelColor: string;
  onUploaded: (result: IpaUploadResult) => void;
};

type UploadPhase = 'idle' | 'picking' | 'uploading' | 'success' | 'error';

export function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const amount = bytes / (1024 ** unitIndex);
  return `${amount >= 10 || unitIndex === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unitIndex]}`;
}

export function useIpaUploader(onUploaded: (result: IpaUploadResult) => void) {
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [filename, setFilename] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const abortController = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => () => {
    mounted.current = false;
    abortController.current?.abort();
  }, []);

  const beginUpload = useCallback(async () => {
    if (abortController.current) return;
    const controller = new AbortController();
    abortController.current = controller;
    setPhase('picking');
    setProgress(0);
    setFilename('');
    setFileSize(0);
    setErrorMessage('');

    try {
      const result = await pickAndUploadIpa({
        signal: controller.signal,
        onFileSelected: (selectedFilename, size) => {
          if (!mounted.current) return;
          setFilename(selectedFilename);
          setFileSize(size);
          setPhase('uploading');
        },
        onProgress: ({ bytesSent, totalBytes }) => {
          if (!mounted.current || totalBytes <= 0) return;
          const nextProgress = Math.max(0, Math.min(1, bytesSent / totalBytes));
          setProgress((current) => (
            Math.floor(current * 100) === Math.floor(nextProgress * 100) ? current : nextProgress
          ));
        },
      });
      if (!mounted.current) return;
      if (!result) {
        setPhase('idle');
        return;
      }
      setFilename(result.originalFilename);
      setFileSize(result.size);
      setProgress(1);
      setPhase('success');
      onUploaded(result);
    } catch (error) {
      if (!mounted.current) return;
      setPhase('error');
      setErrorMessage(
        error instanceof IpaUploadError || error instanceof Error
          ? error.message
          : 'The IPA could not be uploaded.',
      );
    } finally {
      abortController.current = null;
    }
  }, [onUploaded]);

  const cancelUpload = useCallback(() => {
    abortController.current?.abort();
  }, []);

  const isPicking = phase === 'picking';
  const isUploading = phase === 'uploading';
  const isBusy = isPicking || isUploading;
  const buttonLabel = isUploading
    ? 'Cancel Upload'
    : isPicking
      ? 'Opening Files…'
      : phase === 'success'
        ? 'Upload Another IPA'
        : 'Choose IPA & Upload';
  const detail = useMemo(() => {
    if (phase === 'picking') return 'Choose an .ipa file from Files.';
    if (phase === 'uploading') {
      const percent = Math.round(progress * 100);
      return `${filename || 'IPA'}${fileSize ? ` · ${formatFileSize(fileSize)}` : ''} · ${percent}%`;
    }
    if (phase === 'success') {
      return `${filename}${fileSize ? ` · ${formatFileSize(fileSize)}` : ''} · Privately staged and ready for validation.`;
    }
    if (phase === 'error') return errorMessage;
    return 'Uploads to private staging with your saved admin credential. It is not public until the protected importer validates it.';
  }, [errorMessage, fileSize, filename, phase, progress]);

  return {
    beginUpload,
    buttonLabel,
    cancelUpload,
    detail,
    isBusy,
    isPicking,
    isUploading,
    phase,
    progress,
  };
}
