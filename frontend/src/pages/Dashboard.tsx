import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export const Dashboard = () => {
  const { user } = useAuth();

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="bg-white shadow rounded-lg p-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Welcome, {user?.name}!</h1>
        <p className="text-gray-600 mb-6">
          You are logged in as <span className="font-semibold">{user?.role}</span>
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-primary-50 p-6 rounded-lg">
            <h2 className="text-xl font-semibold text-primary-900 mb-2">Cash Flow Module</h2>
            <p className="text-primary-700 mb-4">
              Track revenue and cash movement from station to bank
            </p>
            <Link
              to="/cash-flow"
              className="text-primary-600 hover:text-primary-800 font-medium inline-flex items-center"
            >
              Go to Cash Flow
              <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          <div className="bg-primary-50 p-6 rounded-lg">
            <h2 className="text-xl font-semibold text-primary-900 mb-2">Inventory Module</h2>
            <p className="text-primary-700 mb-4">
              Track fuel levels in tanks and nozzle meter readings
            </p>
            <Link
              to="/inventory"
              className="text-primary-600 hover:text-primary-800 font-medium inline-flex items-center"
            >
              Go to Inventory
              <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

