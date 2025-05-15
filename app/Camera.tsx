"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { addExifToBlob, downloadFromUrl } from "./helper";

export default function Camera() {
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureInterval, setCaptureInterval] = useState(5); // default 5 seconds
  const [imagesCount, setImagesCount] = useState(() => {
    if (typeof window !== 'undefined') {
      return parseInt(localStorage.getItem('roadmetrics_imagesCount') || '0', 10);
    }
    return 0;
  });
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [currentCameraId, setCurrentCameraId] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const captureTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isStartingCaptureRef = useRef(false); // Ref for countdown timer

  const requestPermissions = useCallback(async () => {
    try {
      // Get available cameras first
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(device => device.kind === 'videoinput');
      setAvailableCameras(cameras);
      
      // Use first camera by default if available
      const facingMode = cameras.length > 1 ? { facingMode: 'environment' } : true;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: facingMode,
      });
      
      // Set current camera ID
      if (stream.getVideoTracks().length > 0) {
        setCurrentCameraId(stream.getVideoTracks()[0].getSettings().deviceId || '');
      }
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      navigator.geolocation.getCurrentPosition(
        () => console.log("Location permission granted"),
        (error) => console.error("Location permission denied:", error.message) // More informative error
      );
    } catch (error) {
      console.error("Error accessing camera:", error);
    }
  }, []);

  // Request camera and location permissions
  useEffect(() => {
    requestPermissions();

    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (captureTimerRef.current) {
        clearInterval(captureTimerRef.current);
      }
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };
  }, [requestPermissions]);

  const startCountdown = () => {
    // Prevent starting a new countdown if one is already active or capturing
    if (countdown !== null || isCapturing || isStartingCaptureRef.current) {
      console.log(
        "[DEBUG] StartCountdown: Aborted, already in progress/capturing."
      );
      return;
    }

    console.log("[DEBUG] startCountdown: Called");

    if (countdownTimerRef.current) {
      // Clear any stray previous countdown timer
      clearInterval(countdownTimerRef.current);
    }

    setCountdown(3);
    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null) {
          // Should not happen if logic is correct, but good guard
          if (countdownTimerRef.current)
            clearInterval(countdownTimerRef.current);
          return null;
        }
        console.log(`[DEBUG] Countdown tick: ${prev}`);
        if (prev === 1) {
          if (countdownTimerRef.current)
            clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
          console.log("[DEBUG] Countdown finished, calling startCapturing");
          startCapturing();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const startCapturing = () => {
    // Ensure not to start capturing if already capturing
    // This check is mostly belt-and-suspenders if button logic is correct
    if (isStartingCaptureRef.current) {
      console.warn(
        "[DEBUG] startCapturing: Aborted, already in the process of starting capture (isStartingCaptureRef is true)."
      );
      return;
    }
    if (isCapturing) {
      console.warn(
        "[DEBUG] startCapturing: Aborted, isCapturing is already true."
      );
      return;
    }

    isStartingCaptureRef.current = true;
    setIsCapturing(true);

    // Perform the first capture immediately
    captureImage("IMMEDIATE_FROM_START_CAPTURING");

    if (captureTimerRef.current) {
      console.warn(
        "[DEBUG] startCapturing: Clearing pre-existing captureTimerRef.current. ID:",
        captureTimerRef.current
      );
      clearInterval(captureTimerRef.current);
      captureTimerRef.current = null; // Explicitly nullify
    }

    console.log(
      `[DEBUG] startCapturing: Setting up interval with captureInterval: ${captureInterval}s`
    );
    captureTimerRef.current = setInterval(() => {
      // Check if still capturing. The ref being non-null is a good indicator.
      if (captureTimerRef.current && videoRef.current) {
        // Added videoRef check for safety
        console.log("[DEBUG] Interval Tick: Calling captureImage (INTERVAL)");
        captureImage("INTERVAL_TICK");
      } else {
        console.warn(
          "[DEBUG] Interval Tick: Skipped capture (timer cleared or videoRef missing)."
        );
      }
    }, captureInterval * 1000);
    console.log(
      "[DEBUG] startCapturing: Interval set. Timer ID:",
      captureTimerRef.current
    );

    isStartingCaptureRef.current = false;
    console.log("[DEBUG] startCapturing: Set isStartingCaptureRef to false.");
  };

  const captureImage = async (source: string) => {
    console.log(
      `[DEBUG] captureImage called from: ${source}. Current imagesCount: ${imagesCount}`
    );
    if (!videoRef.current || !videoRef.current.srcObject) {
      console.warn("Video stream not available for capture.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    if (canvas.width === 0 || canvas.height === 0) {
      console.warn(
        `[DEBUG] captureImage (${source}): Canvas dimensions are zero. Video not ready?`
      );
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.error(
        `[DEBUG] captureImage (${source}): Could not get canvas context.`
      );
      return;
    }

    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    console.log(`[DEBUG] captureImage (${source}): Image drawn to canvas.`);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        // Removed async here as it's not needed for canvas.toBlob
        const { latitude, longitude } = position.coords;

        canvas.toBlob(
          async (blob) => {
            // Removed async here, toBlob callback is not async
            if (!blob) {
              console.error("Failed to create blob from canvas.");
              return;
            }

            const fileName = `${"roadmetrics"}_${Date.now()}.jpg`;
            const url = await addExifToBlob(blob, {
              latitude: latitude,
              longitude: longitude,
            });

            downloadFromUrl(url, fileName);

            setImagesCount((prev) => {
              const newCount = prev + 1;
              if (typeof window !== 'undefined') {
                localStorage.setItem('roadmetrics_imagesCount', newCount.toString());
              }
              return newCount;
            });
          },
          "image/jpeg",
          0.9
        );
      },
      (error) => {
        console.error("Error getting location for image:", error.message);
        // Capture without location if geolocation fails
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              console.error("Failed to create blob from canvas (no location).");
              return;
            }
            const fileName = `${"roadmetrics"}_${Date.now()}_no_location.jpg`;
            const url = URL.createObjectURL(blob);
            downloadFromUrl(url, fileName);
            setImagesCount((prev) => {
              const newCount = prev + 1;
              if (typeof window !== 'undefined') {
                localStorage.setItem('roadmetrics_imagesCount', newCount.toString());
              }
              return newCount;
            });
          },
          "image/jpeg",
          0.9
        );
      }
    );
  };

  const stopCapturing = () => {
    console.log("[DEBUG] stopCapturing called");
    if (captureTimerRef.current) {
      console.log(
        "[DEBUG] Clearing captureTimerRef in stopCapturing. ID:",
        captureTimerRef.current
      );
      clearInterval(captureTimerRef.current);
      captureTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      console.log(
        "[DEBUG] Clearing countdownTimerRef in stopCapturing. ID:",
        countdownTimerRef.current
      );
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdown(null);
    setIsCapturing(false);
    isStartingCaptureRef.current = false; // Reset this guard too
  };

  return (
    <div className={`flex flex-col items-center justify-center min-h-screen ${isCapturing ? 'fixed inset-0 z-40 bg-black' : 'bg-gray-100 p-4'}`}>
      <div className={`${isCapturing ? 'w-full h-full' : 'w-full max-w-md bg-white rounded-lg shadow-lg overflow-hidden'}`}>
        <div className="relative aspect-video bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className={`w-full h-full object-cover ${isCapturing ? 'fixed inset-0 z-30' : ''}`}
          />
          {countdown !== null && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
              <span className="text-white text-9xl font-bold">{countdown}</span>
            </div>
          )}
        </div>
        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="captureInterval"
              className="block text-sm font-medium text-gray-700"
            >
              Capture Interval (seconds)
            </label>
            <input
              id="captureInterval"
              type="number"
              min="1"
              value={captureInterval}
              onChange={(e) =>
                setCaptureInterval(Math.max(1, Number(e.target.value)))
              } // Ensure at least 1
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-black"
              disabled={isCapturing || countdown !== null} // Disable during countdown/capture
            />
          </div>

          <div className="flex space-x-2">
            {availableCameras.length > 1 && (
              <button
                onClick={async () => {
                  if (!currentCameraId || !mediaStreamRef.current) return;
                  const currentIndex = availableCameras.findIndex(
                    cam => cam.deviceId === currentCameraId
                  );
                  const nextIndex = (currentIndex + 1) % availableCameras.length;
                  const nextCamera = availableCameras[nextIndex];
                  
                  // Stop current stream
                  mediaStreamRef.current.getTracks().forEach(track => track.stop());
                  
                  // Start new stream with selected camera
                  const stream = await navigator.mediaDevices.getUserMedia({
                    video: { deviceId: { exact: nextCamera.deviceId } }
                  });
                  mediaStreamRef.current = stream;
                  if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                  }
                  setCurrentCameraId(nextCamera.deviceId);
                }}
                className="flex-1 py-2 px-4 bg-gray-500 hover:bg-gray-600 rounded-md text-white font-medium"
                disabled={isCapturing || countdown !== null}
              >
                Switch Camera
              </button>
            )}
            {!isCapturing && ( // Show Start button only if not capturing
              <button
                onClick={startCountdown}
                disabled={countdown !== null || isCapturing} // Disable if countdown active OR already capturing
                className={`flex-1 py-2 px-4 rounded-md ${
                  countdown !== null || isCapturing
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700"
                } text-white font-medium`}
              >
                {countdown !== null ? `Starting (${countdown})...` : "Start"}
              </button>
            )}
            {isCapturing && (
              <>
              <button
                onClick={stopCapturing}
                className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50 py-3 px-6 bg-red-500 hover:bg-red-600 rounded-full text-white font-medium shadow-lg"
              >
                Stop
              </button>

              <div className="fixed top-8 left-1/2 transform -translate-x-1/2 z-50 py-3 px-6 rounded-full text-white font-medium shadow-lg">
                Count : {imagesCount}
                </div>
                </>
            )}

          </div>

          <div className="text-center text-sm text-gray-600">
            Images captured: {imagesCount}
          </div>
          <button
            onClick={() => {
              setImagesCount(0);
              if (typeof window !== 'undefined') {
                localStorage.setItem('roadmetrics_imagesCount', '0');
              }
            }}
            className="w-full py-2 px-4 bg-gray-200 hover:bg-gray-300 rounded-md text-gray-800 font-medium mt-2"
          >
            Reset Count
          </button>
        </div>
      </div>
    </div>
  );
}
