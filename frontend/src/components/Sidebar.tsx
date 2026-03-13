import { NavLink, useLocation } from 'react-router-dom';
import {
  HomeIcon,
  BuildingOfficeIcon,
  FolderIcon,
  FlagIcon,
  KeyIcon,
  DocumentTextIcon,
  Cog6ToothIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import clsx from 'clsx';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const navigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Organizations', href: '/organizations', icon: BuildingOfficeIcon },
  { name: 'Projects', href: '/projects', icon: FolderIcon },
  { name: 'Feature Flags', href: '/feature-flags', icon: FlagIcon },
  { name: 'API Keys', href: '/api-keys', icon: KeyIcon },
  { name: 'Audit Logs', href: '/audit-logs', icon: DocumentTextIcon },
  { name: 'Settings', href: '/settings', icon: Cog6ToothIcon },
];

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const location = useLocation();

  return (
    <>
      {/* Mobile sidebar overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-600 bg-opacity-75 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Mobile sidebar */}
      <div
        className={clsx(
          'fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 transform transition-transform duration-300 ease-in-out lg:hidden',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between h-16 px-4 bg-gray-800">
          <span className="text-xl font-bold text-white">Flagify</span>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>
        <nav className="px-2 py-4 space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href || 
              (item.href !== '/' && location.pathname.startsWith(item.href));
            return (
              <NavLink
                key={item.name}
                to={item.href}
                onClick={onClose}
                className={clsx(
                  'group flex items-center px-2 py-2 text-sm font-medium rounded-md',
                  isActive
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                )}
              >
                <item.icon
                  className={clsx(
                    'mr-3 flex-shrink-0 h-6 w-6',
                    isActive
                      ? 'text-white'
                      : 'text-gray-400 group-hover:text-gray-300'
                  )}
                />
                {item.name}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:bg-gray-900">
        <div className="flex items-center h-16 px-4 bg-gray-800">
          <span className="text-xl font-bold text-white">Flagify</span>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href || 
              (item.href !== '/' && location.pathname.startsWith(item.href));
            return (
              <NavLink
                key={item.name}
                to={item.href}
                className={clsx(
                  'group flex items-center px-2 py-2 text-sm font-medium rounded-md',
                  isActive
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                )}
              >
                <item.icon
                  className={clsx(
                    'mr-3 flex-shrink-0 h-6 w-6',
                    isActive
                      ? 'text-white'
                      : 'text-gray-400 group-hover:text-gray-300'
                  )}
                />
                {item.name}
              </NavLink>
            );
          })}
        </nav>
        <div className="p-4 border-t border-gray-800">
          <p className="text-xs text-gray-500">Flagify v1.0.0</p>
        </div>
      </div>
    </>
  );
}
