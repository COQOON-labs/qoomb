/**
 * Icon components — Heroicons 24×24 outline style.
 *
 * All icons accept an optional `className` prop for sizing and colour.
 * Usage: `<HomeIcon className="w-4 h-4" />`
 *
 * Organised by category:
 *   navigation  — HomeIcon, MenuIcon, ArrowLeftIcon, ChevronUpDownIcon
 *   content     — CalendarIcon, DocumentIcon
 *   actions     — CheckIcon, CheckMarkIcon, PlusIcon
 *   people      — UserIcon, UsersIcon, BellIcon
 *   system      — SettingsIcon, LogOutIcon
 */

export type { IconProps } from './types';

export { HomeIcon, MenuIcon, ArrowLeftIcon, ChevronUpDownIcon } from './navigation';
export { CalendarIcon, DocumentIcon } from './content';
export { CheckIcon, CheckMarkIcon, PlusIcon } from './actions';
export { UserIcon, UsersIcon, BellIcon } from './people';
export { SettingsIcon, LogOutIcon } from './system';
