import { useEffect, useRef, useState } from 'react'

type MobileBarcodeScannerButtonProps = {
  onDetected: (value: string) => void
  disabled?: boolean
  buttonLabel?: string
  buttonTitle?: string
  modalTitle?: string
}

function isMobileScannerSupported() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false
  }

  const hasCameraApi = Boolean(navigator.mediaDevices?.getUserMedia)
  const mediaQueryMatches = typeof window.matchMedia === 'function'
    ? window.matchMedia('(max-width: 900px), (pointer: coarse)').matches
    : false
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '')

  return hasCameraApi && (mediaQueryMatches || mobileUserAgent)
}

function pickRearCamera(devices: Array<{ deviceId: string; label?: string }>) {
  return devices.find(device => /back|rear|environment|trasera|traseira/i.test(String(device.label || '')))
    || devices[0]
    || null
}

export default function MobileBarcodeScannerButton({
  onDetected,
  disabled = false,
  buttonLabel = 'Escanear',
  buttonTitle = 'Escanear codigo de barras',
  modalTitle = 'Escanear codigo de barras',
}: MobileBarcodeScannerButtonProps) {
  const [isSupported, setIsSupported] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const controlsRef = useRef<any>(null)
  const readerRef = useRef<any>(null)

  useEffect(() => {
    setIsSupported(isMobileScannerSupported())
  }, [])

  useEffect(() => {
    if (!isOpen) return

    let cancelled = false

    const stopScanner = () => {
      try {
        controlsRef.current?.stop?.()
      } catch {
        // noop
      }
      controlsRef.current = null

      try {
        readerRef.current?.reset?.()
      } catch {
        // noop
      }
      readerRef.current = null

      const stream = videoRef.current?.srcObject
      if (stream && typeof MediaStream !== 'undefined' && stream instanceof MediaStream) {
        stream.getTracks().forEach(track => track.stop())
      }

      if (videoRef.current) {
        videoRef.current.srcObject = null
      }
    }

    const startScanner = async () => {
      setIsStarting(true)
      setError(null)

      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        if (cancelled) return

        const reader = new BrowserMultiFormatReader()
        readerRef.current = reader

        const devices = await reader.listVideoInputDevices()
        if (cancelled) return

        const preferredDevice = pickRearCamera(devices || [])
        if (!preferredDevice?.deviceId) {
          throw new Error('No se encontro una camara disponible')
        }

        if (!videoRef.current) {
          throw new Error('No se pudo preparar la vista de la camara')
        }

        controlsRef.current = await reader.decodeFromVideoDevice(
          preferredDevice.deviceId,
          videoRef.current,
          result => {
            const rawValue = result?.getText?.() || ''
            const scannedValue = String(rawValue || '').trim()
            if (!scannedValue || cancelled) return

            stopScanner()
            setIsOpen(false)
            onDetected(scannedValue)
          }
        )
      } catch (scanError: any) {
        if (!cancelled) {
          setError(scanError?.message || 'No se pudo abrir la camara del telefono')
        }
      } finally {
        if (!cancelled) {
          setIsStarting(false)
        }
      }
    }

    void startScanner()

    return () => {
      cancelled = true
      stopScanner()
    }
  }, [isOpen, onDetected])

  if (!isSupported) {
    return null
  }

  return (
    <>
      <button
        type="button"
        className="small-btn"
        title={buttonTitle}
        aria-label={buttonTitle}
        disabled={disabled}
        onClick={() => setIsOpen(true)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 7V5a2 2 0 0 1 2-2h2" />
          <path d="M21 7V5a2 2 0 0 0-2-2h-2" />
          <path d="M3 17v2a2 2 0 0 0 2 2h2" />
          <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
          <path d="M7 12h10" />
          <path d="M7 9h1" />
          <path d="M7 15h2" />
          <path d="M11 15h1" />
          <path d="M13 9h1" />
          <path d="M15 15h1" />
          <path d="M17 9h1" />
        </svg>
        {buttonLabel}
      </button>

      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 3000,
            padding: 16,
          }}
        >
          <div
            style={{
              width: 'min(100%, 420px)',
              background: 'var(--modal)',
              color: 'var(--text)',
              borderRadius: 14,
              padding: 16,
              boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>{modalTitle}</h3>
              <button type="button" className="small-btn" onClick={() => setIsOpen(false)}>Cerrar</button>
            </div>

            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
              Apunta la camara al codigo de barras para buscar el producto automaticamente.
            </div>

            <div style={{ borderRadius: 12, overflow: 'hidden', background: '#000', minHeight: 260 }}>
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                style={{ width: '100%', height: 320, objectFit: 'cover', display: 'block' }}
              />
            </div>

            {isStarting && (
              <div style={{ marginTop: 12, fontSize: 13, color: 'var(--muted)' }}>
                Activando camara...
              </div>
            )}

            {error && (
              <div style={{ marginTop: 12, fontSize: 13, color: '#FCA5A5' }}>
                {error}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
