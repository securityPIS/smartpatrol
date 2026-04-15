import React from 'react';
import { Camera, CameraOff, RefreshCcw, X } from 'lucide-react';
import { usePatrol } from '../../context/AppContextRuntime';

export default function PatrolCameraModal() {
  const {
    pendingPatrolCameraCapture,
    closePatrolCameraCapture,
    handlePatrolCameraCapture,
  } = usePatrol();
  const modalRef = React.useRef(null);
  const videoRef = React.useRef(null);
  const streamRef = React.useRef(null);
  const [cameraError, setCameraError] = React.useState('');
  const [isStartingCamera, setIsStartingCamera] = React.useState(false);

  const stopCameraStream = React.useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCameraStream = React.useCallback(async () => {
    if (!pendingPatrolCameraCapture) return;

    setIsStartingCamera(true);
    setCameraError('');
    stopCameraStream();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          aspectRatio: { ideal: 4 / 5 },
          width: { ideal: 1080 },
          height: { ideal: 1350 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (error) {
      console.error('Gagal membuka kamera patroli', error);
      setCameraError('Kamera tidak bisa dibuka. Pastikan izin kamera aktif di browser.');
    } finally {
      setIsStartingCamera(false);
    }
  }, [pendingPatrolCameraCapture, stopCameraStream]);

  React.useEffect(() => {
    if (!pendingPatrolCameraCapture) {
      stopCameraStream();
      setCameraError('');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Browser ini belum mendukung akses kamera langsung.');
      return;
    }

    startCameraStream();

    return () => {
      stopCameraStream();
    };
  }, [pendingPatrolCameraCapture, startCameraStream, stopCameraStream]);

  const handleClose = React.useCallback(() => {
    stopCameraStream();
    closePatrolCameraCapture();
  }, [closePatrolCameraCapture, stopCameraStream]);

  const handleCapture = React.useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const targetAspectRatio = 4 / 5;
    let sourceWidth = width;
    let sourceHeight = height;
    let offsetX = 0;
    let offsetY = 0;

    if (width / height > targetAspectRatio) {
      sourceWidth = Math.round(height * targetAspectRatio);
      offsetX = Math.round((width - sourceWidth) / 2);
    } else {
      sourceHeight = Math.round(width / targetAspectRatio);
      offsetY = Math.round((height - sourceHeight) / 2);
    }

    const canvas = document.createElement('canvas');
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;

    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      setCameraError('Browser tidak mendukung pengambilan gambar dari kamera.');
      return;
    }

    context.drawImage(video, offsetX, offsetY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
    const dataUrl = canvas.toDataURL('image/webp', 0.82);
    await handlePatrolCameraCapture(dataUrl);
    stopCameraStream();
  }, [handlePatrolCameraCapture, stopCameraStream]);

  if (!pendingPatrolCameraCapture) return null;

  return (
    <div className="fixed inset-0 z-[110] bg-[#020617] lg:hidden">
      <div ref={modalRef} className="h-full flex flex-col">
        <div className="flex items-center justify-between px-4 py-4 border-b border-cyan-900/50 bg-[#070b19]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-500">Kamera Patroli</p>
            <h3 className="text-lg font-black text-white">
              {pendingPatrolCameraCapture.type === 'temuan' ? 'Foto Temuan' : 'Foto Aman'}
            </h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="w-10 h-10 rounded-xl border border-cyan-700/60 bg-[#0b1229] text-cyan-300 flex items-center justify-center"
            aria-label="Tutup kamera patroli"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 flex flex-col p-4 gap-4">
          <div className="w-full max-w-sm mx-auto aspect-[4/5] rounded-2xl overflow-hidden border border-cyan-900/50 bg-black relative">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
              autoPlay
            />

            {(isStartingCamera || cameraError) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#020617]/90 text-center px-6">
                {cameraError ? <CameraOff className="w-10 h-10 text-rose-400" /> : <Camera className="w-10 h-10 text-cyan-300 animate-pulse" />}
                <p className={`text-sm font-medium ${cameraError ? 'text-rose-300' : 'text-cyan-200'}`}>
                  {cameraError || 'Membuka kamera...'}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-3">
            {cameraError ? (
              <button
                type="button"
                onClick={startCameraStream}
                className="w-full py-4 rounded-xl bg-cyan-600 text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2"
              >
                <RefreshCcw className="w-4 h-4" />
                Coba Lagi
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCapture}
                disabled={isStartingCamera}
                className="w-full py-4 rounded-xl bg-emerald-600 text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Camera className="w-4 h-4" />
                Ambil Foto
              </button>
            )}

            <button
              type="button"
              onClick={handleClose}
              className="w-full py-3 rounded-xl border border-cyan-900/70 text-cyan-300 font-bold uppercase tracking-widest text-xs bg-[#0b1229]"
            >
              Batal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
