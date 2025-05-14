import piexif from "piexifjs"; // You'll need to install this library

/**
 * Adds EXIF GPS data to an image blob
 * @param originalBlob The original image blob
 * @param exifData Object containing latitude and longitude
 * @returns Promise that resolves with the updated blob
 */
export async function addExifToBlob(
  originalBlob: Blob,
  exifData: {
    latitude: number;
    longitude: number;
  }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const imageData = event.target?.result as string;

        // Convert decimal degrees to EXIF rational format
        const latitude = convertToExifGpsCoordinate(exifData.latitude);
        const longitude = convertToExifGpsCoordinate(exifData.longitude);

        // Determine latitude reference (N/S)
        const latRef = exifData.latitude >= 0 ? "N" : "S";
        // Determine longitude reference (E/W)
        const lngRef = exifData.longitude >= 0 ? "E" : "W";

        // Create EXIF object
        const exifObj = {
          "0th": {},
          Exif: {},
          GPS: {
            [piexif.GPSIFD.GPSLatitude]: latitude,
            [piexif.GPSIFD.GPSLatitudeRef]: latRef,
            [piexif.GPSIFD.GPSLongitude]: longitude,
            [piexif.GPSIFD.GPSLongitudeRef]: lngRef,
          },
          Interop: {},
          "1st": {},
        };

        // Convert EXIF object to string
        const exifBytes = piexif.dump(exifObj);

        // Insert EXIF data into image
        const newImageData = piexif.insert(exifBytes, imageData);

        // Convert back to blob
        resolve(newImageData);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => {
      reject(new Error("Failed to read the blob"));
    };

    reader.readAsDataURL(originalBlob);
  });
}

/**
 * Converts decimal degrees to EXIF rational format (degrees, minutes, seconds)
 * @param decimal Decimal degrees coordinate
 * @returns Array of three rational numbers [degrees, minutes, seconds]
 */
function convertToExifGpsCoordinate(
  decimal: number
): [number[], number[], number[]] {
  const absolute = Math.abs(decimal);
  const degrees = Math.floor(absolute);
  const minutesDecimal = (absolute - degrees) * 60;
  const minutes = Math.floor(minutesDecimal);
  const seconds = (minutesDecimal - minutes) * 60;

  // EXIF stores each component as a rational number (numerator/denominator)
  return [
    [degrees, 1], // degrees as rational
    [minutes, 1], // minutes as rational
    [Math.round(seconds * 100), 100], // seconds as rational (with 2 decimal precision)
  ];
}

/**
 * Creates and triggers a download of a blob with the given filename
 * @param blob The blob to download
 * @param fileName The name to give the downloaded file
 */
export function downloadUrl(url: string, fileName: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
