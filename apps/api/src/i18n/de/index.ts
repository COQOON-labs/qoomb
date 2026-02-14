import type { Translation } from '../i18n-types';

const de: Translation = {
  email: {
    layout: {
      brand: 'QOOMB',
      fallbackLinkLabel:
        'Falls der Button nicht funktioniert, kopiere diesen Link in deinen Browser:',
      unsubscribeNote: 'Du erhältst diese E-Mail, weil dein Konto bei Qoomb registriert ist.',
    },

    emailVerification: {
      subject: 'Bestätige deine E-Mail-Adresse – Qoomb',
      title: 'E-Mail bestätigen',
      greeting: 'Hallo,',
      body: 'Bitte bestätige deine E-Mail-Adresse, um dein Qoomb-Konto zu aktivieren.',
      validity: 'Der Link ist <strong>24 Stunden</strong> gültig.',
      cta: 'E-Mail bestätigen',
      footer: 'Falls du kein Qoomb-Konto erstellt hast, ignoriere diese E-Mail.',
    },

    passwordReset: {
      subject: 'Passwort zurücksetzen – Qoomb',
      title: 'Passwort zurücksetzen',
      greeting: 'Hallo,',
      body: 'Du hast eine Passwort-Zurücksetzung für dein Qoomb-Konto angefordert.',
      validity: 'Der Link ist <strong>1 Stunde</strong> gültig.',
      warning:
        'Falls du kein Passwort-Reset angefordert hast, kannst du diese E-Mail ignorieren. Dein Passwort bleibt unverändert.',
      cta: 'Neues Passwort setzen',
      footer: 'Falls du kein Passwort-Reset angefordert hast, ignoriere diese E-Mail.',
    },

    invitation: {
      subject: '{{inviterName}} hat dich zu Qoomb eingeladen',
      title: 'Du wurdest eingeladen',
      greeting: 'Hallo,',
      body: '<strong>{{inviterName}}</strong> hat dich zu <strong>Qoomb</strong> eingeladen — der privaten Organisations-Plattform für Familien und Teams.',
      validity: 'Die Einladung ist <strong>7 Tage</strong> gültig.',
      cta: 'Einladung annehmen',
      footer: 'Falls du diese Einladung nicht erwartet hast, ignoriere diese E-Mail.',
    },
  },
};

export default de;
