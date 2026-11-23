import React from 'react';
import { Search, Sun, Moon, Menu } from 'lucide-react';
import { Avatar, IconButton } from './ui';
import NotificationBell from './NotificationBell';

/* Header generik: tombol menu (mobile), pencarian, tema, notifikasi, identitas pengguna.
   Blok nama + avatar adalah tombol ke halaman Profil portal yang sedang dibuka (onOpenProfile). */
export default function TopHeader({
  isDark, onToggleTheme, onOpenMenu, onOpenProfile, userName, userRole, profilePhoto, searchPlaceholder,
}) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6">
      <IconButton label="Buka menu" onClick={onOpenMenu} className="-ml-1.5 lg:hidden">
        <Menu size={20} />
      </IconButton>

      <div className="relative hidden w-full max-w-sm sm:block">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" />
        <label htmlFor="global-search" className="sr-only">Cari</label>
        <input
          id="global-search"
          type="search"
          placeholder={searchPlaceholder}
          className="h-9 w-full rounded-lg border border-line bg-subtle pl-9 pr-3 text-sm text-fg placeholder:text-faint focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="ml-auto flex items-center gap-1">
        <IconButton label={isDark ? 'Gunakan tema terang' : 'Gunakan tema gelap'} onClick={onToggleTheme}>
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </IconButton>
        <NotificationBell />

        <div className="ml-2 border-l border-line pl-1.5">
          <button
            type="button"
            onClick={onOpenProfile}
            aria-label="Buka profil"
            title="Buka profil"
            className="flex items-center gap-3 rounded-lg px-1.5 py-1 transition-colors hover:bg-subtle"
          >
            <span className="hidden text-right leading-tight md:block">
              <span className="block text-sm font-medium">{userName}</span>
              <span className="block text-xs text-faint">{userRole}</span>
            </span>
            <Avatar name={userName} src={profilePhoto} size={34} />
          </button>
        </div>
      </div>
    </header>
  );
}
