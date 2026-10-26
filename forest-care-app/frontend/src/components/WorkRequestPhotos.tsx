import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ChangeEvent } from 'react';
import { workRequestsService } from '../services/forestService';
import {
  MAX_PHOTOS_PER_REQUEST,
  formatTakenAt,
  photoErrorMessage,
  preparePhoto,
  releasePhoto,
  uploadPhotos,
  useReleaseOnUnmount,
} from '../utils/photos';
import type { PreparedPhoto } from '../utils/photos';
import type { WorkRequest, WorkRequestPhoto } from '../types';

interface PhotoPickButtonsProps {
  remaining: number;
  disabled?: boolean;
  onPicked: (photos: PreparedPhoto[]) => void;
  onError: (message: string) => void;
}

// "Take a photo" opens the camera on phones; "choose" opens the gallery / file picker
export function PhotoPickButtons({ remaining, disabled, onPicked, onError }: PhotoPickButtonsProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);

  const handleFiles = async (e: ChangeEvent<HTMLInputElement>, fromCamera: boolean) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    const accepted = files.slice(0, remaining);
    setPreparing(true);
    const prepared: PreparedPhoto[] = [];
    const errors: string[] = [];
    for (const file of accepted) {
      try {
        prepared.push(await preparePhoto(file, fromCamera));
      } catch (err) {
        errors.push((err as Error).message);
      }
    }
    setPreparing(false);
    if (files.length > accepted.length) {
      errors.push(`Työpyyntöön voi liittää enintään ${MAX_PHOTOS_PER_REQUEST} kuvaa.`);
    }
    onError(errors.join(' '));
    if (prepared.length > 0) onPicked(prepared);
  };

  const blocked = disabled || preparing || remaining <= 0;
  return (
    <div className="photo-pick">
      <button type="button" className="btn btn-secondary btn-compact" disabled={blocked} onClick={() => cameraRef.current?.click()}>
        📷 Ota kuva
      </button>
      <button type="button" className="btn btn-secondary btn-compact" disabled={blocked} onClick={() => galleryRef.current?.click()}>
        🖼️ Valitse kuvia
      </button>
      {preparing && <small className="photo-pick-status">Käsitellään kuvia...</small>}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => handleFiles(e, true)}
      />
      <input ref={galleryRef} type="file" accept="image/*" multiple hidden onChange={(e) => handleFiles(e, false)} />
    </div>
  );
}

interface PendingPhotoGridProps {
  photos: PreparedPhoto[];
  onRemove?: (key: string) => void;
}

// Photos picked but not saved yet
export function PendingPhotoGrid({ photos, onRemove }: PendingPhotoGridProps) {
  if (photos.length === 0) return null;
  return (
    <ul className="photo-grid">
      {photos.map((photo) => (
        <li key={photo.key} className="photo-thumb">
          <img src={photo.previewUrl} alt="Liitettävä kuva" title={formatTakenAt(photo.takenAt)} />
          {onRemove && (
            <button type="button" className="photo-thumb-remove" onClick={() => onRemove(photo.key)} aria-label="Poista kuva">
              ✕
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

interface PhotoLightboxProps {
  photos: WorkRequestPhoto[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onDelete?: (photo: WorkRequestPhoto) => Promise<void>;
}

function PhotoLightbox({ photos, index, onIndexChange, onClose, onDelete }: PhotoLightboxProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const photo = photos[index];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1);
      if (e.key === 'ArrowRight' && index < photos.length - 1) onIndexChange(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, photos.length, onClose, onIndexChange]);

  if (!photo) return null;

  const remove = async () => {
    if (!onDelete) return;
    setDeleting(true);
    setError('');
    try {
      await onDelete(photo);
      setConfirming(false);
    } catch (err) {
      setError(photoErrorMessage(err, 'poisto'));
    } finally {
      setDeleting(false);
    }
  };

  // Rendered at the body so list and card layout rules don't reach it
  return createPortal(
    <div className="modal-overlay photo-lightbox" onClick={(e) => e.target === e.currentTarget && !deleting && onClose()}>
      <div className="photo-lightbox-card" role="dialog" aria-label="Kuva">
        <div className="photo-lightbox-image">
          <img src={workRequestsService.photoUrl(photo.id)} alt={`Kuva ${index + 1}/${photos.length}`} />
          {index > 0 && (
            <button type="button" className="photo-nav prev" onClick={() => onIndexChange(index - 1)} aria-label="Edellinen kuva">‹</button>
          )}
          {index < photos.length - 1 && (
            <button type="button" className="photo-nav next" onClick={() => onIndexChange(index + 1)} aria-label="Seuraava kuva">›</button>
          )}
        </div>
        <div className="photo-lightbox-bar">
          <span>
            {index + 1}/{photos.length} · {formatTakenAt(photo.taken_at)}
          </span>
          <span className="photo-lightbox-actions">
            {onDelete &&
              (confirming ? (
                <>
                  <span>Poistetaanko kuva?</span>
                  <button type="button" className="btn btn-secondary btn-compact" onClick={() => setConfirming(false)} disabled={deleting}>
                    Ei
                  </button>
                  <button type="button" className="btn btn-danger btn-compact" onClick={remove} disabled={deleting}>
                    {deleting ? 'Poistetaan...' : 'Kyllä'}
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-danger btn-compact" onClick={() => setConfirming(true)}>
                  🗑️ Poista kuva
                </button>
              ))}
            <button type="button" className="btn btn-secondary btn-compact" onClick={onClose} disabled={deleting}>
              Sulje
            </button>
          </span>
        </div>
        {error && <div className="error-message photo-lightbox-error">{error}</div>}
      </div>
    </div>,
    document.body
  );
}

interface WorkRequestPhotoGalleryProps {
  requestId: number;
  photos: WorkRequestPhoto[];
  // Owner view: add and delete photos
  editable?: boolean;
  onUpdated?: (updated: WorkRequest) => void;
}

// Saved photos of a work request as thumbnails, opened in a lightbox
export default function WorkRequestPhotoGallery({ requestId, photos, editable, onUpdated }: WorkRequestPhotoGalleryProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [unsaved, setUnsaved] = useState<PreparedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  useReleaseOnUnmount(unsaved);

  const upload = async (toUpload: PreparedPhoto[]) => {
    setUploading(true);
    setError('');
    const result = await uploadPhotos(requestId, toUpload);
    if (result.updated) onUpdated?.(result.updated);
    setUnsaved(result.remaining);
    setError(result.error ?? '');
    setUploading(false);
  };

  const discardUnsaved = () => {
    unsaved.forEach(releasePhoto);
    setUnsaved([]);
    setError('');
  };

  const deletePhoto = async (photo: WorkRequestPhoto) => {
    const updated = await workRequestsService.deletePhoto(requestId, photo.id);
    onUpdated?.(updated);
    if (updated.photos.length === 0) setOpenIndex(null);
    else setOpenIndex((i) => (i === null ? null : Math.min(i, updated.photos.length - 1)));
  };

  if (!editable && photos.length === 0) return null;

  return (
    <div className="photo-gallery">
      {photos.length > 0 && (
        <ul className="photo-grid">
          {photos.map((photo, i) => (
            <li key={photo.id} className="photo-thumb">
              <button type="button" onClick={() => setOpenIndex(i)} title={formatTakenAt(photo.taken_at)}>
                <img src={workRequestsService.photoUrl(photo.id)} alt={`Kuva ${i + 1}`} loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <>
          {unsaved.length > 0 && (
            <div className="photo-upload-failed">
              <PendingPhotoGrid photos={unsaved} />
              {!uploading && (
                <span className="photo-upload-actions">
                  <button type="button" className="btn btn-primary btn-compact" onClick={() => upload(unsaved)}>
                    ↻ Yritä uudelleen
                  </button>
                  <button type="button" className="btn-link" onClick={discardUnsaved}>Hylkää</button>
                </span>
              )}
            </div>
          )}
          {error && <div className="error-message photo-error">{error}</div>}
          {uploading ? (
            <small className="photo-pick-status">Tallennetaan kuvia...</small>
          ) : (
            unsaved.length === 0 && (
              <PhotoPickButtons
                remaining={MAX_PHOTOS_PER_REQUEST - photos.length}
                onPicked={upload}
                onError={setError}
              />
            )
          )}
        </>
      )}

      {openIndex !== null && (
        <PhotoLightbox
          photos={photos}
          index={openIndex}
          onIndexChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
          onDelete={editable ? deletePhoto : undefined}
        />
      )}
    </div>
  );
}
