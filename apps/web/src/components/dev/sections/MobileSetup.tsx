import { QRCodeSVG } from 'qrcode.react';

export function MobileSetup() {
  // Derive LAN IP from the current browser URL.
  // When accessing the dev server from a LAN address (e.g. 192.168.x.x),
  // this gives us the correct IP for QR codes without exposing it via the API.
  const hostname = window.location.hostname;
  const isLanIp = hostname !== 'localhost' && hostname !== '127.0.0.1';
  const ip = isLanIp ? hostname : null;

  // Cert served by Vite static files (public/dev-cert/) over plain HTTP — no cert trust needed yet
  const certUrl = ip ? `http://${ip}:5173/dev-cert/mkcert-root-ca.mobileconfig` : '';
  // App served by Caddy over HTTPS (extended mode only)
  const appUrl = ip ? `https://${ip}:8443` : '';

  return (
    <div className="p-4 border-b border-white/8">
      <h3 className="text-primary text-sm font-black mb-3 uppercase tracking-widest">
        📱 Mobile Setup
      </h3>

      {!ip && (
        <p className="text-white/40 text-xs mb-3">
          Open the dev server via your LAN IP (e.g. <code>http://192.168.x.x:5173</code>) to see QR
          codes for mobile setup.
        </p>
      )}

      {ip && (
        <>
          {/* Certificate */}
          <div className="mb-4">
            <h4 className="text-white/75 text-sm font-semibold mb-2">1. Install Certificate</h4>
            <div className="bg-white p-3 rounded-lg inline-block">
              <QRCodeSVG value={certUrl} size={120} />
            </div>
            <p className="text-white/40 text-xs mt-2 leading-relaxed">
              Download → Open → Settings → Profile Downloaded → Install →
              <br />
              General → About → Certificate Trust Settings → Enable
            </p>
          </div>

          {/* App URL */}
          <div>
            <h4 className="text-white/75 text-sm font-semibold mb-2">2. Open App</h4>
            <div className="bg-white p-3 rounded-lg inline-block">
              <QRCodeSVG value={appUrl} size={120} />
            </div>
            <p className="text-white/40 text-xs mt-2">{appUrl}</p>
          </div>
        </>
      )}
    </div>
  );
}
