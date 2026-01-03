import { useState, useEffect } from 'react';
import api from '../services/api';
import { StatusBadge } from '../components/shared/StatusBadge';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';

interface FloatingCashData {
  totalFloating: number;
  transactions: any[];
  breakdown: {
    pendingAcceptance: number;
    withAM: number;
  };
}

export const FloatingCashView = () => {
  const [data, setData] = useState<FloatingCashData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFloatingCash();
  }, []);

  const loadFloatingCash = async () => {
    try {
      const res = await api.get('/api/cash/floating-cash');
      setData(res.data);
    } catch (error) {
      console.error('Failed to load floating cash', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!data) {
    return <div className="text-center py-8">No data available</div>;
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Live Floating Cash</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-500">Total Floating Cash</h3>
          <p className="text-3xl font-bold text-primary-600 mt-2">
            {data.totalFloating.toFixed(2)} SAR
          </p>
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-500">Pending Acceptance</h3>
          <p className="text-3xl font-bold text-yellow-600 mt-2">
            {data.breakdown.pendingAcceptance.toFixed(2)} SAR
          </p>
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-sm font-medium text-gray-500">With Area Managers</h3>
          <p className="text-3xl font-bold text-orange-600 mt-2">
            {data.breakdown.withAM.toFixed(2)} SAR
          </p>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Station
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Amount
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                From
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                To
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.transactions.map((tx) => (
              <tr key={tx.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {tx.station.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {tx.cashToAM.toFixed(2)} SAR
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <StatusBadge status={tx.status} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {tx.cashTransfer?.fromUser?.name || 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {tx.cashTransfer?.toUser?.name || 'N/A'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

