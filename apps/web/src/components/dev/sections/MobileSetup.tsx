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
    <div style={{ padding: '16px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
      <h3
        style={{
          color: '#F5C400',
          fontSize: '13px',
          fontWeight: '900',
          marginBottom: '12px',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        📱 Mobile Setup
      </h3>

      {/* Certificate */}
      <div style={{ marginBottom: '16px' }}>
        <h4
          style={{
            color: 'rgba(255, 255, 255, 0.75)',
            fontSize: '13px',
            fontWeight: '600',
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
            color: 'rgba(255, 255, 255, 0.4)',
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
            color: 'rgba(255, 255, 255, 0.75)',
            fontSize: '13px',
            fontWeight: '600',
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
            color: 'rgba(255, 255, 255, 0.4)',
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
