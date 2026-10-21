import { useEffect, useRef } from 'react';

interface VideoBackdropProps {
  src: string;
  poster: string;
}

// Muted, looping full-screen background video with a dark overlay so content stays readable.
// The poster shows while the video loads, if autoplay is blocked (e.g. iOS low power mode)
// and for users who prefer reduced motion (the video is hidden with CSS then).
// Background of the login, registration and password pages
export function AuthBackdrop() {
  return <VideoBackdrop src="/media/login-forest.mp4" poster="/media/login-forest.jpg" />;
}

export default function VideoBackdrop({ src, poster }: VideoBackdropProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // React does not reliably set the muted attribute, and browsers only autoplay muted video
    video.muted = true;
    video.play().catch(() => {
      // Autoplay refused: the poster stays visible
    });
  }, []);

  return (
    <div className="video-backdrop" style={{ backgroundImage: `url(${poster})` }} aria-hidden="true">
      <video ref={videoRef} autoPlay muted loop playsInline preload="auto" poster={poster}>
        <source src={src} type="video/mp4" />
      </video>
      <div className="video-backdrop-overlay" />
    </div>
  );
}
