import type { Translation } from '../i18n-types';

const de = {
  // ── Common ────────────────────────────────────────────────────────────────
  common: {
    brand: 'QOOMB',
    tagline: 'Dein Hive, organisiert',
    loading: 'Laden...',
    save: 'Speichern',
    saving: 'Speichern...',
    cancel: 'Abbrechen',
    add: 'Hinzufügen',
    remove: 'Entfernen',
    back: 'Zurück',
    details: 'Details',
    showAll: 'Alle anzeigen',
    or: 'oder',
    emailLabel: 'E-Mail',
    passwordLabel: 'Passwort',
    passwordHint: 'Min. 8 Zeichen mit Großbuchstabe, Zahl und Sonderzeichen',
    create: 'Erstellen',
    invite: 'Einladen',
  },

  // ── Navigation ───────────────────────────────────────────────────────────────────────────────
  nav: {
    overview: 'Übersicht',
    calendar: 'Kalender',
    tasks: 'Aufgaben',
    members: 'Mitglieder',
    pages: 'Seiten',
    settings: 'Einstellungen',
    mainLabel: 'Hauptnavigation',
    mobileLabel: 'Mobile Navigation',
  },

  // ── Domain entities ───────────────────────────────────────────────────────────────────
  entities: {
    event: 'Termin',
    task: 'Aufgabe',
    page: 'Seite',
  },

  // ── Roles ──────────────────────────────────────────────────────────────────────────────────
  roles: {
    parent: 'Elternteil',
    child: 'Kind',
    guest: 'Gast',
    orgAdmin: 'Admin',
    manager: 'Manager',
    member: 'Mitglied',
  },

  // ── Auth ──────────────────────────────────────────────────────────────────
  auth: {
    signIn: 'Anmelden',
    backToSignIn: 'Zurück zur Anmeldung',
    login: {
      title: 'Willkommen zurück',
      subtitle: 'Melde dich in deinem Hive an',
      forgotPassword: 'Passwort vergessen?',
      noAccount: 'Noch kein Konto?',
      createOne: 'Jetzt erstellen',
    },
    register: {
      title: 'Erstelle deinen Hive',
      titleInvite: 'Einladung annehmen',
      subtitleInvite: 'Richte dein Konto ein, um dem Hive beizutreten',
      subtitle: 'Organisiere deine Familie oder dein Team',
      nameLabel: 'Dein Name',
      hiveNameLabel: 'Hive-Name',
      hiveNamePlaceholder: 'z.B. Familie Müller',
      hiveTypeLabel: 'Hive-Typ',
      joinHive: 'Hive beitreten',
      createHive: 'Hive erstellen',
      alreadyHaveAccount: 'Du hast bereits ein Konto?',
    },
    forgotPassword: {
      title: 'Passwort vergessen',
      subtitle: 'Gib deine E-Mail ein und wir senden dir einen Link zum Zurücksetzen',
      sendResetLink: 'Link senden',
      successTitle: 'E-Mail prüfen',
      successSubtitle:
        'Falls ein Konto mit dieser Adresse existiert, haben wir einen Link zum Zurücksetzen gesendet. Er ist 1 Stunde gültig.',
    },
    resetPassword: {
      title: 'Passwort zurücksetzen',
      subtitle: 'Wähle ein neues Passwort für dein Konto',
      newPasswordLabel: 'Neues Passwort',
      confirmPasswordLabel: 'Passwort bestätigen',
      passwordMismatch: 'Passwörter stimmen nicht überein.',
      setNewPassword: 'Neues Passwort setzen',
    },
    verifyEmail: {
      loadingTitle: 'E-Mail wird verifiziert…',
      successTitle: 'E-Mail bestätigt',
      successSubtitle:
        'Deine E-Mail-Adresse wurde bestätigt. Du kannst jetzt alle Funktionen nutzen.',
      goToDashboard: 'Zum Dashboard',
      failedTitle: 'Verifizierung fehlgeschlagen',
      failedSubtitle: 'Dieser Link ist ungültig oder abgelaufen.',
    },
    passKey: {
      signInWithPassKey: 'Mit PassKey anmelden',
      authFailed: 'PassKey-Authentifizierung fehlgeschlagen',
      registrationFailed: 'Registrierung fehlgeschlagen',
      sectionTitle: 'PassKeys',
      addPassKey: 'PassKey hinzufügen',
      deviceNamePlaceholder: 'Gerätename (optional)',
      registerPassKey: 'PassKey registrieren',
      noPassKeysYet: 'Noch keine PassKeys registriert.',
      defaultName: 'PassKey',
      added: 'Hinzugefügt',
      lastUsed: 'Zuletzt verwendet',
      never: 'Nie',
    },
  },

  // ── Layout ────────────────────────────────────────────────────────────────
  layout: {
    emailVerification: {
      message: 'Bitte bestätige deine E-Mail-Adresse, um alle Funktionen freizuschalten.',
      sent: 'E-Mail gesendet ✓',
      resend: 'Erneut senden',
      dismiss: 'Schließen',
    },
    hiveSwitcher: {
      selectHive: 'Hive auswählen',
    },
    userMenu: {
      profile: 'Profil',
      logout: 'Abmelden',
    },
  },

  // ── Profile ───────────────────────────────────────────────────────────────
  profile: {
    title: 'Profil',
    displayNameLabel: 'Anzeigename',
    displayNamePlaceholder: 'Dein Name',
    emailLabel: 'E-Mail',
    roleLabel: 'Rolle',
    birthdayLabel: 'Geburtstag',
    saved: 'Profil gespeichert!',
    saveError: 'Fehler beim Speichern. Bitte erneut versuchen.',
    language: {
      title: 'Sprache',
      description: 'Wähle die Sprache für die Oberfläche',
      saved: 'Sprache aktualisiert!',
      saveError: 'Sprache konnte nicht aktualisiert werden.',
      deDE: 'Deutsch (Deutschland)',
      deAT: 'Deutsch (Österreich)',
      enUS: 'English (US)',
    },
    security: {
      title: 'Sicherheit',
      description: 'Verwalte deine PassKeys und Anmeldemethoden',
    },
  },

  // ── Dashboard ─────────────────────────────────────────────────────────────
  dashboard: {
    memberCount: '{count} Mitglieder',
    greetings: {
      morning0: 'Guten Morgen, {name}! ☀️',
      morning1: 'Na, schon wach, {name}?',
      morning2: 'Moin, {name}!',
      afternoon0: 'Hey {name}, da bist du ja!',
      afternoon1: 'Schön, dass du da bist, {name}!',
      afternoon2: 'Schön, dich zu sehen, {name}!',
      evening0: 'Guten Abend, {name}! 🌆',
      evening1: 'Na {name}, Feierabend? 🌆',
      evening2: 'Feierabend, {name}! 🌇',
      night0: 'Noch wach, {name}?',
      night1: 'Nachtschicht, {name}? 🌙',
      night2: 'Die Nacht ist noch jung, {name}! 🌙',
    },
    todayIntro: 'Heute: ',
    openLabel: 'offen',
    nextEvent: 'Nächster Termin',
    moreEvents: 'Weitere Termine',
    progressText: '{done} von {total} erledigt',
    addTask: 'Aufgabe hinzufügen',
    emptyEvents: 'Noch keine Termine geplant.',
    emptyTasks: 'Noch keine Aufgaben vorhanden.',
    quickAdd: {
      title: 'Schnell hinzufügen',
      placeholder: 'Was steht als nächstes an?',
    },
  },
} satisfies Translation;

export default de;
