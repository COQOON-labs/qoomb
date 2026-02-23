import type { BaseTranslation } from '../i18n-types';

const en = {
  // ── Common ────────────────────────────────────────────────────────────────
  common: {
    brand: 'QOOMB',
    tagline: 'Your hive, organised',
    loading: 'Loading...',
    save: 'Save',
    saving: 'Saving...',
    cancel: 'Cancel',
    add: 'Add',
    remove: 'Remove',
    back: 'Back',
    details: 'Details',
    showAll: 'Show all',
    or: 'or',
    emailLabel: 'Email',
    passwordLabel: 'Password',
    passwordHint: 'Min. 8 characters with uppercase, number and special character',
    create: 'Create',
    invite: 'Invite',
  },

  // ── Navigation ───────────────────────────────────────────────────────────────────────────────
  nav: {
    overview: 'Overview',
    calendar: 'Calendar',
    tasks: 'Tasks',
    members: 'Members',
    pages: 'Pages',
    settings: 'Settings',
  },

  // ── Domain entities ───────────────────────────────────────────────────────────────────
  entities: {
    event: 'Event',
    task: 'Task',
    page: 'Page',
  },

  // ── Roles ──────────────────────────────────────────────────────────────────────────────────
  roles: {
    parent: 'Parent',
    child: 'Child',
    guest: 'Guest',
    orgAdmin: 'Admin',
    manager: 'Manager',
    member: 'Member',
  },

  // ── Auth ──────────────────────────────────────────────────────────────────
  auth: {
    signIn: 'Sign in',
    backToSignIn: 'Back to sign in',
    login: {
      title: 'Welcome back',
      subtitle: 'Sign in to your hive',
      forgotPassword: 'Forgot password?',
      noAccount: 'No account?',
      createOne: 'Create one',
    },
    register: {
      title: 'Create your hive',
      titleInvite: 'Accept invitation',
      subtitleInvite: 'Set up your account to join the hive',
      subtitle: 'Start organising your family or team',
      nameLabel: 'Your name',
      hiveNameLabel: 'Hive name',
      hiveNamePlaceholder: 'e.g. Doe Family',
      hiveTypeLabel: 'Hive type',
      joinHive: 'Join hive',
      createHive: 'Create hive',
      alreadyHaveAccount: 'Already have an account?',
    },
    forgotPassword: {
      title: 'Forgot password',
      subtitle: "Enter your email and we'll send you a reset link",
      sendResetLink: 'Send reset link',
      successTitle: 'Check your email',
      successSubtitle:
        'If an account exists for that address, we sent a reset link. It expires in 1 hour.',
    },
    resetPassword: {
      title: 'Reset password',
      subtitle: 'Choose a new password for your account',
      newPasswordLabel: 'New password',
      confirmPasswordLabel: 'Confirm password',
      passwordMismatch: 'Passwords do not match.',
      setNewPassword: 'Set new password',
    },
    verifyEmail: {
      loadingTitle: 'Verifying your email…',
      successTitle: 'Email verified',
      successSubtitle: 'Your email address has been confirmed. You can now use all features.',
      goToDashboard: 'Go to dashboard',
      failedTitle: 'Verification failed',
      failedSubtitle: 'This link is invalid or has expired.',
    },
    passKey: {
      signInWithPassKey: 'Sign in with PassKey',
      authFailed: 'PassKey authentication failed',
      registrationFailed: 'Registration failed',
      sectionTitle: 'PassKeys',
      addPassKey: 'Add PassKey',
      deviceNamePlaceholder: 'Device name (optional)',
      registerPassKey: 'Register PassKey',
      noPassKeysYet: 'No PassKeys registered yet.',
      defaultName: 'PassKey',
      added: 'Added',
      lastUsed: 'Last used',
      never: 'Never',
    },
  },

  // ── Layout ────────────────────────────────────────────────────────────────
  layout: {
    emailVerification: {
      message: 'Please verify your email address to unlock all features.',
      sent: 'Email sent ✓',
      resend: 'Resend',
      dismiss: 'Dismiss',
    },
    hiveSwitcher: {
      selectHive: 'Select hive',
    },
    userMenu: {
      profile: 'Profile',
      logout: 'Sign out',
    },
  },

  // ── Profile ───────────────────────────────────────────────────────────────
  profile: {
    title: 'Profile',
    displayNameLabel: 'Display name',
    displayNamePlaceholder: 'Your name',
    emailLabel: 'Email',
    roleLabel: 'Role',
    birthdayLabel: 'Birthday',
    saved: 'Profile saved!',
    saveError: 'Failed to save. Please try again.',
    language: {
      title: 'Language',
      description: 'Choose the language for the interface',
      saved: 'Language updated!',
      saveError: 'Failed to update language.',
      deDE: 'Deutsch (Deutschland)',
      deAT: 'Deutsch (Österreich)',
      enUS: 'English (US)',
    },
    security: {
      title: 'Security',
      description: 'Manage your PassKeys and login methods',
    },
  },

  // ── Dashboard ─────────────────────────────────────────────────────────────
  dashboard: {
    memberCount: '{count:number} members',
    greeting: 'Good morning, {name:string}! 👋',
    todayIntro: 'Today: ',
    openLabel: 'open',
    nextEvent: 'Next event',
    moreEvents: 'More events',
    progressText: '{done:number} of {total:number} completed',
    addTask: 'Add task',
    quickAdd: {
      title: 'Quick add',
      placeholder: "What's coming up next?",
    },
  },
} satisfies BaseTranslation;

export default en;
