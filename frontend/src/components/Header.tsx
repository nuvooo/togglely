import { useState } from 'react';
import { Menu, Transition } from '@headlessui/react';
import {
  Bars3Icon,
  UserCircleIcon,
  ChevronDownIcon,
  BuildingOfficeIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '@/store/authStore';
import clsx from 'clsx';

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { user, logout } = useAuthStore();
  const [currentOrg, setCurrentOrg] = useState('Personal Organization');

  const organizations = ['Personal Organization', 'Acme Corp', 'Tech Startup'];

  const handleLogout = () => {
    logout();
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left side */}
          <div className="flex items-center">
            <button
              onClick={onMenuClick}
              className="p-2 -ml-2 text-gray-400 lg:hidden hover:text-gray-500"
            >
              <Bars3Icon className="w-6 h-6" />
            </button>

            {/* Organization selector */}
            <Menu as="div" className="relative ml-4">
              <Menu.Button className="flex items-center max-w-xs px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2">
                <BuildingOfficeIcon className="w-5 h-5 mr-2 text-gray-400" />
                <span className="truncate max-w-[150px]">{currentOrg}</span>
                <ChevronDownIcon className="w-5 h-5 ml-2 -mr-1 text-gray-400" />
              </Menu.Button>

              <Transition
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
              >
                <Menu.Items className="absolute left-0 z-10 mt-2 w-64 origin-top-left rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                  <div className="py-1">
                    <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                      Organizations
                    </div>
                    {organizations.map((org) => (
                      <Menu.Item key={org}>
                        {({ active }) => (
                          <button
                            onClick={() => setCurrentOrg(org)}
                            className={clsx(
                              active ? 'bg-gray-100 text-gray-900' : 'text-gray-700',
                              'block w-full px-4 py-2 text-left text-sm',
                              currentOrg === org && 'font-medium text-primary-600'
                            )}
                          >
                            {org}
                            {currentOrg === org && (
                              <span className="ml-2 text-primary-600">✓</span>
                            )}
                          </button>
                        )}
                      </Menu.Item>
                    ))}
                    <div className="border-t border-gray-100 mt-1 pt-1">
                      <Menu.Item>
                        {({ active }) => (
                          <a
                            href="/organizations/new"
                            className={clsx(
                              active ? 'bg-gray-100 text-gray-900' : 'text-gray-700',
                              'block px-4 py-2 text-sm text-primary-600'
                            )}
                          >
                            + Create Organization
                          </a>
                        )}
                      </Menu.Item>
                    </div>
                  </div>
                </Menu.Items>
              </Transition>
            </Menu>
          </div>

          {/* Right side */}
          <div className="flex items-center space-x-4">
            {/* User menu */}
            <Menu as="div" className="relative">
              <Menu.Button className="flex items-center max-w-xs text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2">
                <span className="sr-only">Open user menu</span>
                <div className="flex items-center">
                  <UserCircleIcon className="w-8 h-8 text-gray-400" />
                  <span className="hidden ml-2 text-sm font-medium text-gray-700 md:block">
                    {user?.name}
                  </span>
                  <ChevronDownIcon className="hidden w-5 h-5 ml-1 text-gray-400 md:block" />
                </div>
              </Menu.Button>

              <Transition
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
              >
                <Menu.Items className="absolute right-0 z-10 w-48 mt-2 origin-top-right bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                  <div className="py-1">
                    <div className="px-4 py-2 border-b border-gray-100">
                      <p className="text-sm font-medium text-gray-900">
                        {user?.name}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {user?.email}
                      </p>
                    </div>
                    <Menu.Item>
                      {({ active }) => (
                        <a
                          href="/settings"
                          className={clsx(
                            active ? 'bg-gray-100' : '',
                            'block px-4 py-2 text-sm text-gray-700'
                          )}
                        >
                          Settings
                        </a>
                      )}
                    </Menu.Item>
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={handleLogout}
                          className={clsx(
                            active ? 'bg-gray-100' : '',
                            'block w-full px-4 py-2 text-left text-sm text-gray-700'
                          )}
                        >
                          Sign out
                        </button>
                      )}
                    </Menu.Item>
                  </div>
                </Menu.Items>
              </Transition>
            </Menu>
          </div>
        </div>
      </div>
    </header>
  );
}
