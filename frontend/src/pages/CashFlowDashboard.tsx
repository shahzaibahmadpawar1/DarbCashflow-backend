import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import api from '../services/api';
import { StatusBadge } from '../components/shared/StatusBadge';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';

interface CashTransaction {
  id: string;
  shiftId: string;
  stationId: string;
  litersSold: number;
  ratePerLiter: number;
  totalRevenue: number;
  cardPayments: number;
  cashOnHand: number;
  bankDeposit: number;
  cashToAM: number;
  status: string;
  createdAt: string;
  station: { name: string };
  cashTransfer?: {
    id: string;
    fromUser: { name: string };
    toUser: { name: string };
    receiptUrl?: string;
  };
}

interface Station {
  id: string;
  name: string;
}

export const CashFlowDashboard = () => {
  const { isSM, isAM } = useAuth();
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [formData, setFormData] = useState({
    shiftId: '',
    stationId: '',
    litersSold: '',
    ratePerLiter: '',
    cardPayments: '',
    bankDeposit: '',
  });

  useEffect(() => {
    loadTransactions();
    loadStations();
  }, []);

  const loadStations = async () => {
    try {
      const res = await api.get('/api/stations');
      setStations(res.data.stations);
    } catch (error) {
      console.error('Failed to load stations', error);
    }
  };

  const loadTransactions = async () => {
    try {
      const res = await api.get('/api/cash/transactions');
      setTransactions(res.data.transactions);
    } catch (error) {
      console.error('Failed to load transactions', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post(`/api/cash/shifts/${formData.shiftId}/transactions`, {
        stationId: formData.stationId,
        litersSold: parseFloat(formData.litersSold),
        ratePerLiter: parseFloat(formData.ratePerLiter),
        cardPayments: parseFloat(formData.cardPayments || '0'),
        bankDeposit: parseFloat(formData.bankDeposit || '0'),
      });
      setShowEntryForm(false);
      setFormData({
        shiftId: '',
        stationId: '',
        litersSold: '',
        ratePerLiter: '',
        cardPayments: '',
        bankDeposit: '',
      });
      loadTransactions();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to create transaction');
    }
  };

  const handleTransfer = async (transactionId: string, toUserId: string) => {
    try {
      await api.post(`/api/cash/transactions/${transactionId}/transfer`, { toUserId });
      loadTransactions();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to initiate transfer');
    }
  };

  const handleAccept = async (transactionId: string) => {
    if (!confirm('Accept this cash transfer?')) return;
    try {
      await api.post(`/api/cash/transactions/${transactionId}/accept`);
      alert('Cash accepted successfully');
      loadTransactions();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to accept cash');
    }
  };

  const handleDeposit = async (transactionId: string, file: File) => {
    try {
      const formData = new FormData();
      formData.append('receipt', file);
      await api.post(`/api/cash/transactions/${transactionId}/deposit`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      alert('Cash deposited successfully');
      loadTransactions();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to deposit cash');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Cash Flow Dashboard</h1>
        {isSM && (
          <button
            onClick={() => setShowEntryForm(!showEntryForm)}
            className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700"
          >
            {showEntryForm ? 'Cancel' : 'New Transaction'}
          </button>
        )}
      </div>

      {showEntryForm && isSM && (
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Enter Cash Transaction</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Station</label>
                <select
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm p-2"
                  value={formData.stationId}
                  onChange={async (e) => {
                    const stationId = e.target.value;
                    setFormData({ ...formData, stationId });
                    if (stationId) {
                      try {
                        const res = await api.get(`/api/shifts/stations/${stationId}/current`);
                        if (res.data.shift) {
                          setFormData(prev => ({ ...prev, stationId, shiftId: res.data.shift.id }));
                        }
                      } catch (err) {
                        console.error("Failed to fetch current shift", err);
                      }
                    }
                  }}
                >
                  <option value="">Select Station</option>
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Shift ID</label>
                <input
                  type="text"
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm p-2"
                  value={formData.shiftId}
                  onChange={(e) => setFormData({ ...formData, shiftId: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Liters Sold</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm p-2"
                  value={formData.litersSold}
                  onChange={(e) => setFormData({ ...formData, litersSold: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Rate per Liter</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm p-2"
                  value={formData.ratePerLiter}
                  onChange={(e) => setFormData({ ...formData, ratePerLiter: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Card Payments</label>
                <input
                  type="number"
                  step="0.01"
                  className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm p-2"
                  value={formData.cardPayments}
                  onChange={(e) => setFormData({ ...formData, cardPayments: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Bank Deposit</label>
                <input
                  type="number"
                  step="0.01"
                  className="mt-1 block w-full rounded-md border border-gray-300 shadow-sm p-2"
                  value={formData.bankDeposit}
                  onChange={(e) => setFormData({ ...formData, bankDeposit: e.target.value })}
                />
              </div>
            </div>
            <button
              type="submit"
              className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700"
            >
              Submit
            </button>
          </form>
        </div>
      )}

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Station</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Liters</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Revenue</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cash to AM</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {transactions.map((tx) => (
              <tr key={tx.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(tx.createdAt).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {tx.station.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {tx.litersSold.toFixed(2)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {tx.totalRevenue.toFixed(2)} SAR
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {tx.cashToAM.toFixed(2)} SAR
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <StatusBadge status={tx.status} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  {tx.status === 'PENDING_ACCEPTANCE' && isSM && (
                    <button
                      onClick={() => {
                        // Default to a mock AM ID if user doesn't input one, for easier testing without real users
                        const defaultAMId = 'mock-am-id';
                        const toUserId = prompt('Enter Area Manager User ID:', defaultAMId);
                        if (toUserId) handleTransfer(tx.id, toUserId);
                      }}
                      className="text-primary-600 hover:text-primary-900"
                    >
                      Transfer to AM
                    </button>
                  )}
                  {tx.status === 'PENDING_ACCEPTANCE' && isAM && (
                    <button
                      onClick={() => handleAccept(tx.id)}
                      className="text-primary-600 hover:text-primary-900 ml-4"
                    >
                      Accept Cash
                    </button>
                  )}
                  {tx.status === 'WITH_AM' && isAM && (
                    <label className="text-primary-600 hover:text-primary-900 cursor-pointer">
                      Deposit to Bank
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleDeposit(tx.id, file);
                        }}
                      />
                    </label>
                  )}
                  {tx.cashTransfer?.receiptUrl && (
                    <a
                      href={tx.cashTransfer.receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 hover:text-primary-900 ml-2"
                    >
                      Receipt
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

