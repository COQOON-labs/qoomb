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
    <div style={{ padding: '16px', borderBottom: '1px solid #334155' }}>
      <h3
        style={{
          color: '#eab308',
          fontSize: '16px',
          fontWeight: '600',
          marginBottom: '12px',
        }}
      >
        📱 Mobile Setup
      </h3>

      {/* Certificate */}
      <div style={{ marginBottom: '16px' }}>
        <h4
          style={{
            color: '#cbd5e1',
            fontSize: '14px',
            fontWeight: '500',
            marginBottom: '8px',
          }}
        >
          1. Install Certificate
        </h4>
        <div
          style={{
            backgroundColor: '#fff',
            padding: '12px',
            borderRadius: '8px',
            display: 'inline-block',
          }}
        >
          <QRCodeSVG value={certUrl} size={120} />
        </div>
        <p
          style={{
            color: '#94a3b8',
            fontSize: '12px',
            marginTop: '8px',
            lineHeight: '1.5',
          }}
        >
          Download → Open → Settings → Profile Downloaded → Install →
          <br />
          General → About → Certificate Trust Settings → Enable
        </p>
      </div>

      {/* App URL */}
      <div>
        <h4
          style={{
            color: '#cbd5e1',
            fontSize: '14px',
            fontWeight: '500',
            marginBottom: '8px',
          }}
        >
          2. Open App
        </h4>
        <div
          style={{
            backgroundColor: '#fff',
            padding: '12px',
            borderRadius: '8px',
            display: 'inline-block',
          }}
        >
          <QRCodeSVG value={appUrl} size={120} />
        </div>
        <p
          style={{
            color: '#94a3b8',
            fontSize: '12px',
            marginTop: '8px',
          }}
        >
          {appUrl}
        </p>
      </div>
    </div>
  );
}
