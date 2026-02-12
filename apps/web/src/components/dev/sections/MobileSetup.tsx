import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';

export function MobileSetup() {
  const [ip, setIp] = useState<string>('');

  useEffect(() => {
    fetch('/api/ip')
      .then((res) => res.text())
      .then(setIp)
      .catch(() => setIp('unknown'));
  }, []);

  const certUrl = `http://${ip}:8888/mkcert-root-ca.mobileconfig`;
  const appUrl = `https://${ip}:8443`;

  return (
    <div className="p-4 border-b border-white/8">
      <h3 className="text-primary text-[13px] font-black mb-3 uppercase tracking-[0.08em]">
        📱 Mobile Setup
      </h3>

      {/* Certificate */}
      <div className="mb-4">
        <h4 className="text-white/75 text-[13px] font-semibold mb-2">1. Install Certificate</h4>
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
        <h4 className="text-white/75 text-[13px] font-semibold mb-2">2. Open App</h4>
        <div className="bg-white p-3 rounded-lg inline-block">
          <QRCodeSVG value={appUrl} size={120} />
        </div>
        <p className="text-white/40 text-xs mt-2">{appUrl}</p>
      </div>
    </div>
  );
}
